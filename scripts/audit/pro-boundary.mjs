/**
 * Proof that a member cannot make themselves a paying customer.
 *
 * `users` update is `id = @request.auth.id` and PocketBase rules are per record
 * rather than per field, so every account can already write its own row. The
 * only thing standing between that and free Pro for anybody who has read the
 * network tab is a request hook, and a hook nobody checks from the receiving
 * side is a hope.
 *
 * So this boots a throwaway PocketBase from the repo's own migrations and hooks
 * and asks, from each account in turn:
 *
 *   Can a member set their own pro_until?
 *   Can a member clear one that was granted?
 *   Can a member relabel where it came from?
 *   Can a member move somebody else's?
 *   Can a member read whether somebody else pays?
 *   Can an account holding the app's OWN admin role grant it?
 *   Does the grant script actually grant, and does it extend rather than reset?
 *   Does an expired date read as unpaid?
 *   Does /api/enforma/me answer for the caller and nobody else?
 *
 * The last two matter as much as the refusals. An entitlement that cannot be
 * granted is not safe, it is broken, and the screens behind it would be
 * unreachable for the people who paid.
 *
 *   node scripts/audit/pro-boundary.mjs
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

const account = async (email) => {
  const created = await api('POST', '/api/collections/users/records',
    { email, password: 'passw0rd123', passwordConfirm: 'passw0rd123' }, su)
  const auth = await api('POST', '/api/collections/users/auth-with-password',
    { identity: email, password: 'passw0rd123' })
  return { id: created.json.id, token: auth.json.token }
}

const grantPro = (args) =>
  new Promise((resolve) => {
    const p = spawn('node', ['scripts/admin/grant-pro.mjs', '--server', pb.base, ...args], {
      env: { ...process.env, PB_SUPERUSER_EMAIL: 'probe@enforma.test', PB_SUPERUSER_PASSWORD: 'Sup3rSecret123' },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let out = ''
    p.stdout.on('data', (d) => (out += d))
    p.stderr.on('data', (d) => (out += d))
    p.on('exit', (code) => resolve({ code, out: out.trim() }))
  })

/** The field as the superuser sees it, which is the only account that can. */
const proOf = async (id) => {
  const r = await api('GET', `/api/collections/users/records/${id}`, undefined, su)
  return { until: String(r.json.pro_until ?? ''), source: String(r.json.pro_source ?? '') }
}

const me = (token) => api('GET', '/api/enforma/me', undefined, token)

const inMonths = (n) => {
  const d = new Date()
  d.setUTCMonth(d.getUTCMonth() + n)
  return d.toISOString().slice(0, 10)
}

try {
  const member = await account('member@pro.test')
  const other = await account('other@pro.test')

  console.log('\nbefore anybody has paid')
  check('the field is empty', (await proOf(member.id)).until, '')
  check('and the account is told so', (await me(member.token)).json?.pro, false)
  check('with no date to cache', (await me(member.token)).json?.proUntil, null)
  check('an anonymous caller gets nothing', (await me(undefined)).status, 401)

  console.log('\nwhat a member can write on their own row')
  /* The whole reason this file exists: `id = @request.auth.id` already lets
     them PATCH this record, so the refusal has to come from the hook. */
  const selfGrant = await api('PATCH', `/api/collections/users/records/${member.id}`,
    { pro_until: `${inMonths(12)} 00:00:00.000Z` }, member.token)
  check('setting their own pro_until is refused', selfGrant.status, 403)
  check('and the field did not move', (await proOf(member.id)).until, '')
  check('setting pro_source is refused too', (await api('PATCH',
    `/api/collections/users/records/${member.id}`, { pro_source: 'stripe' }, member.token)).status, 403)

  /* An unrelated field on the same row must still be writable, or the guard has
     stopped being a guard and become an outage. */
  check('an ordinary field on the same row still saves', (await api('PATCH',
    `/api/collections/users/records/${member.id}`, { area: 'lisboa' }, member.token)).status, 200)

  console.log('\nwhat a member can write on somebody else\'s')
  check('moving another account\'s pro_until is refused', (await api('PATCH',
    `/api/collections/users/records/${other.id}`,
    { pro_until: `${inMonths(12)} 00:00:00.000Z` }, member.token)).status, 404)
  check('and reading whether they pay is refused', (await api('GET',
    `/api/collections/users/records/${other.id}`, undefined, member.token)).status, 404)

  console.log('\nwhat the app\'s own admin role buys')
  /**
   * A platform admin is a member of this product with a role, not the operator
   * of the server. The hook lets a PocketBase superuser through because it must
   * — they hold the dashboard and the database file — and this is the check
   * that the exemption stopped exactly there. It is the distinction that erodes
   * quietly, because both of them are called "admin" in conversation.
   */
  const staff = await account('staff@pro.test')
  await api('POST', '/api/collections/platform_admins/records', { owner: staff.id }, su)
  check('the grant is on the account', (await api('GET',
    `/api/collections/platform_admins/records?filter=${encodeURIComponent(`owner = "${staff.id}"`)}`,
    undefined, su)).json.items?.length, 1)
  check('and it still cannot pay for itself', (await api('PATCH',
    `/api/collections/users/records/${staff.id}`,
    { pro_until: `${inMonths(12)} 00:00:00.000Z` }, staff.token)).status, 403)
  check('nor for anybody else', (await api('PATCH',
    `/api/collections/users/records/${member.id}`,
    { pro_until: `${inMonths(12)} 00:00:00.000Z` }, staff.token)).status, 404)

  console.log('\nthe grant script')
  const granted = await grantPro(['--account', 'member@pro.test', '--months', '1'])
  check('exits clean', granted.code, 0)
  const afterGrant = await proOf(member.id)
  check('writes a date about a month out', afterGrant.until.slice(0, 7), inMonths(1).slice(0, 7))
  check('and says where it came from', afterGrant.source, 'grant')
  check('the account is now told it is Pro', (await me(member.token)).json?.pro, true)
  check('and is given the date to cache', typeof (await me(member.token)).json?.proUntil, 'string')

  console.log('\ntopping up early')
  /* Extending from `now` rather than from the date already held would silently
     shorten a subscription every time somebody renewed before it ran out. */
  await grantPro(['--account', 'member@pro.test', '--months', '1'])
  check('adds a second month instead of resetting to one',
    (await proOf(member.id)).until.slice(0, 7), inMonths(2).slice(0, 7))

  console.log('\nonce it is granted')
  check('the member still cannot clear it', (await api('PATCH',
    `/api/collections/users/records/${member.id}`, { pro_until: '' }, member.token)).status, 403)
  check('and it is still there', (await proOf(member.id)).until.slice(0, 7), inMonths(2).slice(0, 7))

  console.log('\nwhen it lapses')
  const lapsed = await grantPro(['--account', 'other@pro.test', '--until', '2020-01-01'])
  check('a past date is accepted by the script', lapsed.code, 0)
  check('and reads as unpaid', (await me(other.token)).json?.pro, false)
  check('while still reporting the date it holds',
    String((await me(other.token)).json?.proUntil ?? '').slice(0, 4), '2020')

  console.log('\nrevoking')
  check('exits clean', (await grantPro(['--account', 'member@pro.test', '--revoke'])).code, 0)
  check('the field is empty again', (await proOf(member.id)).until, '')
  check('and the account is told so', (await me(member.token)).json?.pro, false)
} finally {
  await pb.stop()
}

console.log(failures === 0 ? '\nall clear\n' : `\n${failures} failed\n`)
process.exit(failures === 0 ? 0 : 1)
