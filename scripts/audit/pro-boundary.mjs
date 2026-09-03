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
 *   Does an unsigned, mis-signed, stale or wrong-mode webhook move anything?
 *   Does a correctly signed one, and does the same one twice pay twice?
 *   Can a member read the billing ledger, or claim somebody customer id?
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
import { createHmac } from 'node:crypto'
import { startSandbox } from './pb-sandbox.mjs'

/**
 * The sandbox inherits this process's environment, so the webhook route is
 * configured before the server boots. A test-mode key on purpose: the route
 * derives the mode it will accept from the key rather than from a second
 * variable, and this is where that gets checked.
 */
const WEBHOOK_SECRET = 'whsec_boundary_probe_secret'
process.env.STRIPE_SECRET_KEY = 'sk_test_boundary_probe'
process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET
process.env.STRIPE_PRICE_MONTHLY = 'price_boundary_probe'

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

/**
 * A webhook exactly as Stripe builds one: HMAC-SHA256 over `${t}.${body}`,
 * lowercase hex, in a `Stripe-Signature` header.
 *
 * Posted with `fetch` rather than through `pb.api`, because the digest is over
 * the bytes and `api` would re-serialise an object. This is also the one place
 * that proves PocketBase's own `$security.hs256` returns the hex Stripe signs
 * with, which the unit spec deliberately cannot: it hands the function under
 * test a stand-in digest.
 */
const postWebhook = async (event, { secret = WEBHOOK_SECRET, at = null, header = null } = {}) => {
  const body = JSON.stringify(event)
  const t = at ?? Math.floor(Date.now() / 1000)
  const signature =
    header ?? `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${body}`, 'utf8').digest('hex')}`
  const res = await fetch(`${pb.base}/api/enforma/stripe-webhook`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'Stripe-Signature': signature },
    body,
  })
  return { status: res.status, json: await res.json().catch(() => ({})) }
}

const invoicePaid = (id, customer, endSec) => ({
  id,
  type: 'invoice.paid',
  livemode: false,
  data: { object: { customer, lines: { data: [{ period: { end: endSec } }] } } },
})

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

  console.log('\nwhat the webhook refuses')
  const payer = await account('payer@billing.test')
  const periodEnd = Math.floor(Date.now() / 1000) + 30 * 86400

  const unsigned = await fetch(`${pb.base}/api/enforma/stripe-webhook`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(invoicePaid('evt_unsigned', 'cus_probe', periodEnd)),
  })
  check('an unsigned body', unsigned.status, 400)
  check('one signed with the wrong secret',
    (await postWebhook(invoicePaid('evt_wrong', 'cus_probe', periodEnd), { secret: 'whsec_nope' })).status, 400)
  check('one signed five minutes ago',
    (await postWebhook(invoicePaid('evt_stale', 'cus_probe', periodEnd),
      { at: Math.floor(Date.now() / 1000) - 400 })).status, 400)
  check('one with no signature in the header',
    (await postWebhook(invoicePaid('evt_bare', 'cus_probe', periodEnd), { header: 't=1' })).status, 400)
  /* A live event at a test-mode server. Both directions of that mismatch are
     worse than refusing, and the mode comes off the key. */
  check('a live event at a test-mode server',
    (await postWebhook({ ...invoicePaid('evt_live', 'cus_probe', periodEnd), livemode: true })).status, 400)
  check('and none of that touched the account', (await proOf(payer.id)).until, '')

  console.log('\nlinking the customer')
  const linked = await postWebhook({
    id: 'evt_checkout_1',
    type: 'checkout.session.completed',
    livemode: false,
    data: { object: { client_reference_id: payer.id, customer: 'cus_probe' } },
  })
  check('a signed session is accepted', linked.status, 200)
  const afterLink = await api('GET', `/api/collections/users/records/${payer.id}`, undefined, su)
  check('the customer is on the account', afterLink.json.stripe_customer, 'cus_probe')
  check('and the source says where it came from', afterLink.json.pro_source, 'stripe')
  check('but nothing is paid yet', String(afterLink.json.pro_until ?? ''), '')

  console.log('\na paid invoice')
  check('is accepted', (await postWebhook(invoicePaid('evt_inv_1', 'cus_probe', periodEnd)).then((r) => r.status)), 200)
  const paid = await proOf(payer.id)
  check('and sets the date the invoice names',
    paid.until.slice(0, 10), new Date(periodEnd * 1000).toISOString().slice(0, 10))
  check('the account is told it is Pro', (await me(payer.token)).json?.pro, true)

  console.log('\nthe same event again')
  /**
   * The check this whole ledger exists for. Stripe delivers at least once and
   * sometimes twice, and a redelivery that moved the date again would be a
   * second month nobody paid for.
   */
  const replay = await postWebhook(invoicePaid('evt_inv_1', 'cus_probe', periodEnd + 30 * 86400))
  check('is accepted so Stripe stops retrying', replay.status, 200)
  check('and says it was a duplicate', replay.json?.duplicate, true)
  check('and the date did not move', (await proOf(payer.id)).until, paid.until)

  console.log('\na renewal')
  const renewal = periodEnd + 30 * 86400
  check('is accepted', (await postWebhook(invoicePaid('evt_inv_2', 'cus_probe', renewal))).status, 200)
  check('and pushes the date forward',
    (await proOf(payer.id)).until.slice(0, 10), new Date(renewal * 1000).toISOString().slice(0, 10))

  console.log('\nan invoice with no period on it')
  const noPeriod = await postWebhook({
    id: 'evt_inv_3',
    type: 'invoice.paid',
    livemode: false,
    data: { object: { customer: 'cus_probe', lines: { data: [{}] } } },
  })
  check('is recorded rather than guessed at', noPeriod.status, 200)
  check('and the date stayed where it was',
    (await proOf(payer.id)).until.slice(0, 10), new Date(renewal * 1000).toISOString().slice(0, 10))

  console.log('\nan invoice for somebody we do not know')
  check('is recorded and grants nothing',
    (await postWebhook(invoicePaid('evt_inv_4', 'cus_stranger', renewal))).status, 200)

  console.log('\nwhat a member can see and claim')
  /* A PocketBase list rule filters rather than refuses, so 200 with nothing in
     it is the answer to look for. Asserting the status would have passed for a
     rule that handed over every row. */
  const memberSees = await api('GET', '/api/collections/billing_events/records', undefined, payer.token)
  check('the ledger answers a member', memberSees.status, 200)
  check('with nothing in it', memberSees.json.items?.length, 0)
  /* A platform admin is meant to read it: that is what the rule says, and
     somebody has to be able to see an event that arrived and did not apply. */
  const staffSees = await api('GET', '/api/collections/billing_events/records', undefined, staff.token)
  check('and hands the rows to a platform admin', staffSees.json.items?.length > 0, true)
  /* Claiming somebody else's customer id would point their renewals here. */
  /**
   * The one of these three worth stealing. `invoice.paid` carries a customer and
   * no account reference, so an account that could claim somebody else's would
   * point that person's renewals at itself.
   *
   * This failed the first time it ran: the migration that added the field said
   * in a comment that the guard covered it, and the guard had never been told.
   */
  check('claiming a customer id is refused', (await api('PATCH',
    `/api/collections/users/records/${payer.id}`, { stripe_customer: 'cus_someone_else' }, payer.token)).status, 403)
  check('and the link is untouched',
    (await api('GET', `/api/collections/users/records/${payer.id}`, undefined, su)).json.stripe_customer, 'cus_probe')

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
