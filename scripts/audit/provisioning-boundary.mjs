/**
 * Proof that the script which turns a paying application into a customer works.
 *
 * `grant-gym.mjs` is the only path from "they paid" to "they can publish", and
 * it is run by hand at the moment somebody is waiting. Nothing else in this
 * repository exercises it, so a rename on the server or a new required field
 * would be found by a person mid-provisioning rather than by CI.
 *
 * Enterprise made that worse: one account owning several rooms means the cap
 * has to be raised before the rooms are made, and getting that order wrong
 * leaves a half-provisioned customer.
 *
 *   node scripts/audit/provisioning-boundary.mjs
 *
 * Needs the PocketBase binary at deploy/pocketbase/.local/pocketbase.
 */
import { spawn } from 'node:child_process'
import { startSandbox } from './pb-sandbox.mjs'

let failures = 0
const check = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failures += 1
  console.log(
    `  ${ok ? 'ok  ' : 'FAIL'}  ${label}` +
      (ok ? '' : `\n          want ${JSON.stringify(want)}\n          got  ${JSON.stringify(got)}`),
  )
}

const pb = await startSandbox()
const { su, api } = pb

const grant = (args) =>
  new Promise((resolve) => {
    const p = spawn('node', ['scripts/admin/grant-gym.mjs', '--server', pb.base, ...args], {
      env: { ...process.env, PB_SUPERUSER_EMAIL: 'probe@enforma.test', PB_SUPERUSER_PASSWORD: 'Sup3rSecret123' },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let out = ''
    p.stdout.on('data', (d) => (out += d))
    p.stderr.on('data', (d) => (out += d))
    p.on('exit', (code) => resolve({ code, out }))
  })

const account = async (email) =>
  (await api('POST', '/api/collections/users/records',
    { email, password: 'passw0rd123', passwordConfirm: 'passw0rd123' }, su)).json

const gymsOwnedBy = async (id) => {
  const r = await api('GET',
    `/api/collections/gyms/records?perPage=50&filter=${encodeURIComponent(`owner = "${id}"`)}`, undefined, su)
  return (r.json.items ?? []).map((g) => ({ name: g.name, plan: g.plan, operators: (g.operators ?? []).length }))
}

try {
  console.log('\none room')
  const solo = await account('solo@provision.test')
  await account('coach@provision.test')
  const one = await grant(['--owner', 'solo@provision.test', '--gym', 'Iron House', '--plan', 'plus',
                           '--operators', 'coach@provision.test'])
  check('the script succeeds', one.code, 0)
  const soloGyms = await gymsOwnedBy(solo.id)
  check('one gym, on the plan asked for, with the owner and the coach at the desk',
    soloGyms, [{ name: 'Iron House', plan: 'plus', operators: 2 }])

  console.log('\nrunning it again')
  const again = await grant(['--owner', 'solo@provision.test', '--gym', 'Iron House', '--plan', 'plus'])
  check('is idempotent, not a second gym', (await gymsOwnedBy(solo.id)).length, 1)
  check('and still succeeds', again.code, 0)

  console.log('\nseveral rooms, which is what Enterprise is')
  const group = await account('group@provision.test')
  const many = await grant(['--owner', 'group@provision.test', '--plan', 'plus',
                            '--gym', 'North Room', '--gym', 'South Room', '--gym', 'Riverside'])
  check('the script succeeds', many.code, 0)
  const rooms = (await gymsOwnedBy(group.id)).map((g) => g.name).sort()
  check('three rooms under one account', rooms, ['North Room', 'Riverside', 'South Room'])
  const owner = await api('GET', `/api/collections/users/records/${group.id}`, undefined, su)
  check('and the cap was raised to match, before the rooms were made', owner.json.gym_cap, 3)

  console.log('\nwhat it refuses')
  const bad = await grant(['--owner', 'group@provision.test', '--gym', 'Nope', '--plan', 'enterprise'])
  check('enterprise is not a plan value', bad.code, 1)
  check('and it says what to do instead', /gym_cap|several --gym/.test(bad.out), true)
  const missing = await grant(['--owner', 'nobody@provision.test', '--gym', 'Ghost', '--plan', 'plus'])
  check('an owner with no account stops the run', missing.code !== 0, true)
  check('before any gym is made',
    (await api('GET', `/api/collections/gyms/records?filter=${encodeURIComponent('name = "Ghost"')}`,
      undefined, su)).json.items?.length ?? 0, 0)
} finally {
  await pb.stop()
}

console.log(failures === 0 ? '\nall clear\n' : `\n${failures} failed\n`)
process.exit(failures === 0 ? 0 : 1)
