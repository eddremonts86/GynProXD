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
 *   Is a member with no gym refused a checkout meant for members?
 *   Does a paid member subscription write the date Stripe named, and does
 *     cancelling leave it to expire rather than taking it back?
 *   Can a member claim any of the billing fields on their own row?
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
 * A webhook the way Stripe builds one, at the route the gym billing already
 * owns: `t=…,v1=…` over `t.body`, HMAC-SHA256, lowercase hex.
 *
 * Posted with `fetch` rather than through `pb.api`, because the digest is over
 * the bytes and `api` would re-serialise an object.
 *
 * The signature, the tolerance and the idempotency of that route are
 * `billing-boundary.mjs`'s to prove and it does. What is checked here is only
 * what a MEMBER subscription does differently: it writes a date rather than a
 * plan, and lapsing leaves that date alone.
 */
const postWebhook = async (event, { secret = WEBHOOK_SECRET } = {}) => {
  const body = JSON.stringify(event)
  const t = Math.floor(Date.now() / 1000)
  const signature = `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${body}`, 'utf8').digest('hex')}`
  const res = await fetch(`${pb.base}/api/enforma/billing/webhook`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'Stripe-Signature': signature },
    body,
  })
  return { status: res.status, json: await res.json().catch(() => ({})) }
}

/** A subscription event, which is the object shape that route reads. */
const subscription = (userId, { type = 'customer.subscription.updated', status = 'active', endSec = 0, lookup = 'enf_sub_pro_eur_month' } = {}) => ({
  id: `evt_${Math.random().toString(36).slice(2, 10)}`,
  type,
  livemode: false,
  data: {
    object: {
      id: 'sub_probe',
      status,
      current_period_end: endSec || undefined,
      metadata: { enforma_user: userId, lookup },
    },
  },
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

  console.log('\nwhat is on nearby, before paying')
  /* Refused before the vendor key is looked at, which is what makes this
     provable on a sandbox that has none. */
  const near = (token, query) => api('GET', `/api/enforma/events/near${query}`, undefined, token)
  check('a member without Pro is refused', (await near(member.token, '?geo=ezs42')).status, 403)
  check('and so is nobody at all', (await near(undefined, '?geo=ezs42')).status, 401)

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

  console.log('\nwhat the app\'s own admin role opens')
  /**
   * Every paid surface, because whoever runs the platform has to be able to
   * open every screen in it. Answered by the server rather than by a
   * client-side exception, so there is one answer rather than two that can
   * disagree — and reported rather than written, because stamping a date on an
   * admin would be a lie in the field the billing webhook owns and would
   * outlive them being one.
   */
  check('an admin is Pro', (await me(staff.token)).json?.pro, true)
  check('and is told why', (await me(staff.token)).json?.admin, true)
  check('with no date invented for them', (await me(staff.token)).json?.proUntil, null)
  check('and nothing written to the field', (await proOf(staff.id)).until, '')
  check('an ordinary member is not', (await me(member.token)).json?.pro, false)
  check('nor claimed to be an admin', (await me(member.token)).json?.admin, false)

  console.log('\na member subscription')
  const payer = await account('payer@billing.test')
  const periodEnd = Math.floor(Date.now() / 1000) + 30 * 86400
  const day = (sec) => new Date(sec * 1000).toISOString().slice(0, 10)

  /* The gym route refuses a checkout from somebody who owns no gym. A member
     price must not be refused for that reason: the thing being billed is the
     account, and being signed in is the whole test. Stripe is unreachable with
     a probe key, so 502 is the pass here and 403 is the failure. */
  const memberCheckout = await api('POST', '/api/enforma/billing/checkout',
    { price: 'enf_sub_pro_eur_month', origin: 'https://enforma.test' }, payer.token)
  check('a member with no gym is not refused the checkout', memberCheckout.status === 403, false)
  const gymCheckout = await api('POST', '/api/enforma/billing/checkout',
    { price: 'enf_sub_plus_eur_month', origin: 'https://enforma.test' }, payer.token)
  check('and a gym price still is', gymCheckout.status, 403)

  console.log('\nwhat a paid member subscription writes')
  check('the event is accepted',
    (await postWebhook(subscription(payer.id, { endSec: periodEnd }))).status, 200)
  const paid = await proOf(payer.id)
  check('the date is the period end Stripe named', paid.until.slice(0, 10), day(periodEnd))
  check('and it says where it came from', paid.source, 'stripe')
  check('the account is told it is Pro', (await me(payer.token)).json?.pro, true)

  console.log('\na renewal')
  const renewal = periodEnd + 30 * 86400
  check('is accepted', (await postWebhook(subscription(payer.id, { endSec: renewal }))).status, 200)
  check('and pushes the date forward', (await proOf(payer.id)).until.slice(0, 10), day(renewal))

  console.log('\nthe same event twice')
  /* No ledger, and none needed: the date is SET to what the subscription says
     it is paid to, so applying the same event again lands on the same state.
     Idempotent by construction is a stronger property than a ledger. */
  const twice = subscription(payer.id, { endSec: renewal })
  await postWebhook(twice)
  await postWebhook(twice)
  check('leaves the date where it was', (await proOf(payer.id)).until.slice(0, 10), day(renewal))

  console.log('\nwhile Stripe is still retrying')
  check('past_due is accepted',
    (await postWebhook(subscription(payer.id, { status: 'past_due', endSec: renewal }))).status, 200)
  check('and takes nothing away', (await proOf(payer.id)).until.slice(0, 10), day(renewal))

  console.log('\nwhen it is cancelled')
  /* Nothing to do. `pro_until` already says when it runs out, and Stripe
     cancels at period end by default, so clearing it would take back days
     somebody paid for. */
  check('the event is accepted',
    (await postWebhook(subscription(payer.id, { type: 'customer.subscription.deleted', status: 'canceled' }))).status, 200)
  check('and the date is left to expire on its own',
    (await proOf(payer.id)).until.slice(0, 10), day(renewal))

  console.log('\na subscription with no period on it')
  check('is accepted', (await postWebhook(subscription(payer.id, { status: 'active' }))).status, 200)
  check('and the date is not guessed at',
    (await proOf(payer.id)).until.slice(0, 10), day(renewal))

  console.log('\nwhat a member can claim')
  for (const field of ['stripe_customer', 'stripe_subscription', 'billing_status']) {
    check(`claiming ${field} is refused`, (await api('PATCH',
      `/api/collections/users/records/${payer.id}`, { [field]: 'mine-now' }, payer.token)).status, 403)
  }

  console.log('\nthe grant script')
  const granted = await grantPro(['--account', 'member@pro.test', '--months', '1'])
  check('exits clean', granted.code, 0)
  const afterGrant = await proOf(member.id)
  check('writes a date about a month out', afterGrant.until.slice(0, 7), inMonths(1).slice(0, 7))
  check('and says where it came from', afterGrant.source, 'grant')
  check('the account is now told it is Pro', (await me(member.token)).json?.pro, true)
  check('and may ask what is on nearby, as far as a keyless sandbox lets it',
    (await near(member.token, '?geo=ezs42')).status, 503)
  check('with a cell or a city required first', (await near(member.token, '')).status, 400)
  check('and a coordinate refused as neither',
    (await near(member.token, '?geo=41.39,2.17')).status, 400)
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
