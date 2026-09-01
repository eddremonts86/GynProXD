/**
 * Proof that the platform's two audiences stay apart, run against a real
 * PocketBase rather than a mock.
 *
 * The client-side rule has unit tests (src/lib/messages.spec.ts). Those cannot
 * see the collection rules, which are the layer that decides what an account
 * can fetch straight off the API — and a leak there does not need the app to be
 * involved at all. So this boots a throwaway server from the repo's own
 * migrations and hooks, builds the four accounts that matter, and asks the
 * questions the feature exists to answer:
 *
 *   Can somebody who pays a gym see an offer written for people with no gym?
 *   Can a gym address the whole platform?
 *   Can anybody but a platform admin publish as the house?
 *
 * Every answer is checked from the receiving side. The sender's intent is not
 * evidence.
 *
 *   node scripts/audit/house-gym-boundary.mjs
 *
 * Requires the PocketBase binary at deploy/pocketbase/.local/pocketbase, which
 * is where the local dev setup already puts it.
 */
import { spawn } from 'node:child_process'
import { chmod, cp, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '../..')
const PB = path.join(ROOT, 'deploy/pocketbase/.local/pocketbase')
const PORT = Number(process.env.PB_PROBE_PORT ?? 8791)
const BASE = `http://127.0.0.1:${PORT}`
const SUPER = { identity: 'probe@enforma.test', password: 'Sup3rSecret123' }

let failures = 0
const check = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failures += 1
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : `\n          want ${JSON.stringify(want)}\n          got  ${JSON.stringify(got)}`}`)
}

async function api(method, route, body, token) {
  const res = await fetch(BASE + route, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { Authorization: token } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  return { status: res.status, json: await res.json().catch(() => ({})) }
}

const run = (cmd, args) =>
  new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: 'ignore' })
    p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))))
    p.on('error', reject)
  })

const dir = await mkdtemp(path.join(tmpdir(), 'enforma-house-'))
let server

try {
  const binary = path.join(dir, 'pocketbase')
  await cp(PB, binary)
  await chmod(binary, 0o755)
  await cp(path.join(ROOT, 'deploy/pocketbase/pb_migrations'), path.join(dir, 'pb_migrations'), {
    recursive: true,
  })
  await cp(path.join(ROOT, 'deploy/pocketbase/pb_hooks'), path.join(dir, 'pb_hooks'), {
    recursive: true,
  })

  const data = path.join(dir, 'pb_data')
  await run(binary, [
    'superuser', 'upsert', SUPER.identity, SUPER.password, '--dir', data,
  ])

  server = spawn(
    binary,
    ['serve', '--http', `127.0.0.1:${PORT}`, '--dir', data,
     '--hooksDir', path.join(dir, 'pb_hooks'), '--migrationsDir', path.join(dir, 'pb_migrations')],
    { stdio: 'ignore' },
  )

  for (let i = 0; i < 60; i++) {
    if (await fetch(`${BASE}/api/health`).then((r) => r.ok).catch(() => false)) break
    await new Promise((r) => setTimeout(r, 250))
  }

  const su = (await api('POST', '/api/collections/_superusers/auth-with-password', SUPER)).json.token
  if (!su) throw new Error('the sandbox server never came up')

  const houseList = await api(
    'GET', `/api/collections/gyms/records?filter=${encodeURIComponent("kind='house'")}`, undefined, su,
  )
  const house = houseList.json.items?.[0]
  console.log('\nmigration')
  check('exactly one house gym exists', houseList.json.items?.length, 1)
  if (!house) throw new Error('no house gym: the migration did not run')

  const gym = (await api('POST', '/api/collections/gyms/records', { name: 'Hierro Viejo', kind: 'gym' }, su)).json

  const account = async (email) => {
    const created = await api('POST', '/api/collections/users/records',
      { email, password: 'passw0rd123', passwordConfirm: 'passw0rd123' }, su)
    const auth = await api('POST', '/api/collections/users/auth-with-password',
      { identity: email, password: 'passw0rd123' })
    return { id: created.json.id, token: auth.json.token }
  }
  const loner = await account('loner@enforma.test')
  const member = await account('member@enforma.test')
  const operator = await account('operator@enforma.test')
  const admin = await account('admin@enforma.test')

  await api('PATCH', `/api/collections/gyms/records/${gym.id}`, { operators: [operator.id] }, su)
  await api('POST', '/api/collections/platform_admins/records', { owner: admin.id }, su)
  /* Through the join code, the way a member actually joins: a direct write to
     users.gym is refused by the membership hook, which is the point of it. */
  await api('POST', '/api/collections/gym_secrets/records', { gym: gym.id, code: 'IRON-88' }, su)
  await api('POST', '/api/enforma/join-with-code', { gym: gym.id, code: 'IRON-88' }, member.token)

  const publish = (who, target, scope, title) =>
    api('POST', '/api/collections/gym_messages/records',
      { gym: target, author: who.id, kind: 'announcement', title, scope }, who.token)

  console.log('\nwho may publish what')
  check('admin, as the house, to the unaffiliated',
    (await publish(admin, house.id, 'unaffiliated', 'For the unclaimed')).status, 200)
  check('admin, as the house, to everyone',
    (await publish(admin, house.id, 'everyone', 'For everyone')).status, 200)
  check('the house refuses a members-scoped message it could deliver to nobody',
    (await publish(admin, house.id, 'members', 'Nobody at all')).status, 400)
  check('an operator cannot publish as the house',
    (await publish(operator, house.id, 'everyone', 'Rogue house')).status, 403)
  check('a gym cannot address the whole platform from its own row',
    (await publish(operator, gym.id, 'everyone', 'Rogue reach')).status, 403)
  check('a gym can address its own members',
    (await publish(operator, gym.id, 'members', 'Gym news')).status, 200)
  check('an ordinary member cannot publish as the house',
    (await publish(loner, house.id, 'everyone', 'Not an admin')).status, 403)

  const inbox = async (token) => {
    const list = await api('GET', '/api/collections/gym_messages/records?perPage=50', undefined, token)
    return (list.json.items ?? []).map((m) => m.title).sort()
  }
  console.log('\nwhat each account can actually fetch')
  check('somebody with no gym gets both platform messages',
    await inbox(loner.token), ['For everyone', 'For the unclaimed'])
  check("a gym's member never sees the offer written for the unaffiliated",
    await inbox(member.token), ['For everyone', 'Gym news'])
  check('an operator is affiliated too, by running a gym',
    await inbox(operator.token), ['For everyone', 'Gym news'])

  console.log('\njoining')
  check('nobody applies to belong to nothing',
    (await api('POST', '/api/collections/gym_join_requests/records',
      { owner: loner.id, gym: house.id, status: 'pending' }, loner.token)).status, 400)
  check('a real gym still takes requests',
    (await api('POST', '/api/collections/gym_join_requests/records',
      { owner: loner.id, gym: gym.id, status: 'pending' }, loner.token)).status, 200)
} finally {
  server?.kill()
  await rm(dir, { recursive: true, force: true }).catch(() => {})
}

console.log(`\n${failures === 0 ? 'PASS — the two audiences stay apart.' : `FAIL — ${failures} check(s) failed.`}`)
process.exit(failures === 0 ? 0 : 1)
