/**
 * Proof that only Stripe can change what a gym has paid for.
 *
 * The webhook is the one route in this product where believing an unverified
 * request costs money: a body claiming a customer upgraded, accepted, is a free
 * Enterprise account. So it is verified before it is read, and this asks that
 * from the outside, with the same HMAC Stripe uses.
 *
 *   Is an unsigned body refused? A wrongly signed one? A replayed one?
 *   Does a real event set the plan and the cap, on every room the account owns?
 *   Does cancelling take the paid surfaces and leave everything else?
 *   Does `past_due` change nothing, because Stripe is still retrying?
 *   Can an account that owns no gym start a checkout?
 *
 * No network: the signature is computed here with the same secret the hook
 * reads, so the whole path is exercised without Stripe being involved.
 *
 *   node scripts/audit/billing-boundary.mjs
 *
 * Needs the PocketBase binary at deploy/pocketbase/.local/pocketbase.
 */
import { createHmac } from 'node:crypto'
import { startSandbox } from './pb-sandbox.mjs'

const WEBHOOK_SECRET = 'whsec_test_boundary_secret'

let failures = 0
const check = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failures += 1
  console.log(
    `  ${ok ? 'ok  ' : 'FAIL'}  ${label}` +
      (ok ? '' : `\n          want ${JSON.stringify(want)}\n          got  ${JSON.stringify(got)}`),
  )
}

const pb = await startSandbox({ env: { STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET, STRIPE_SECRET_KEY: 'sk_test_not_used' } })
const { su, api } = pb

/** Exactly what Stripe sends: `t=<unix>,v1=<hex hmac of "t.body">`. */
const sign = (body, secret = WEBHOOK_SECRET, at = Math.floor(Date.now() / 1000)) =>
  `t=${at},v1=${createHmac('sha256', secret).update(`${at}.${body}`).digest('hex')}`

const post = async (body, header) => {
  const res = await fetch(`${pb.base}/api/enforma/billing/webhook`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(header ? { 'Stripe-Signature': header } : {}) },
    body,
  })
  return { status: res.status, json: await res.json().catch(() => ({})) }
}

const event = (type, userId, lookup, status, id = 'sub_test_1') =>
  JSON.stringify({ type, data: { object: { id, status, metadata: { enforma_user: userId, lookup } } } })

try {
  const owner = (await api('POST', '/api/collections/users/records',
    { email: 'billing@enforma.test', password: 'passw0rd123', passwordConfirm: 'passw0rd123' }, su)).json
  const auth = await api('POST', '/api/collections/users/auth-with-password',
    { identity: 'billing@enforma.test', password: 'passw0rd123' })
  const gym = (await api('POST', '/api/collections/gyms/records',
    { name: 'Billing Room', kind: 'gym', plan: 'base', owner: owner.id, operators: [owner.id] }, su)).json

  console.log('\nwho the webhook believes')
  const body = event('customer.subscription.updated', owner.id, 'enf_sub_plus_eur_month', 'active')
  check('an unsigned body is refused', (await post(body)).status, 400)
  check('a wrongly signed one is refused',
    (await post(body, sign(body, 'whsec_wrong'))).status, 400)
  check('a body signed for different content is refused',
    (await post(body, sign('{"other":"payload"}'))).status, 400)
  const old = Math.floor(Date.now() / 1000) - 4000
  check('and one signed an hour ago is refused',
    (await post(body, sign(body, WEBHOOK_SECRET, old))).status, 400)

  console.log('\nwhat a real event does')
  check('a signed event is accepted', (await post(body, sign(body))).status, 200)
  const afterPlus = await api('GET', `/api/collections/gyms/records/${gym.id}`, undefined, su)
  check('the gym is on the plan that was paid for', afterPlus.json.plan, 'plus')
  const ownerPlus = await api('GET', `/api/collections/users/records/${owner.id}`, undefined, su)
  check('the cap stays one, because Plus is one room', ownerPlus.json.gym_cap, 1)
  check('and the status is stored in Stripe words', ownerPlus.json.billing_status, 'active')

  console.log('\nenterprise raises the cap, and nothing else does')
  const ent = event('customer.subscription.updated', owner.id, 'enf_sub_enterprise_eur_month', 'active')
  check('accepted', (await post(ent, sign(ent))).status, 200)
  const ownerEnt = await api('GET', `/api/collections/users/records/${owner.id}`, undefined, su)
  check('five rooms', ownerEnt.json.gym_cap, 5)

  console.log('\nwhile Stripe is still retrying')
  const late = event('customer.subscription.updated', owner.id, 'enf_sub_enterprise_eur_month', 'past_due')
  check('past_due is accepted', (await post(late, sign(late))).status, 200)
  const onRetry = await api('GET', `/api/collections/gyms/records/${gym.id}`, undefined, su)
  check('and takes nothing away yet', onRetry.json.plan, 'plus')

  console.log('\nwhen the money stops')
  const gone = event('customer.subscription.deleted', owner.id, 'enf_sub_enterprise_eur_month', 'canceled')
  check('accepted', (await post(gone, sign(gone))).status, 200)
  const lapsed = await api('GET', `/api/collections/gyms/records/${gym.id}`, undefined, su)
  check('the gym drops to base', lapsed.json.plan, 'base')
  const ownerGone = await api('GET', `/api/collections/users/records/${owner.id}`, undefined, su)
  check('the cap drops to one', ownerGone.json.gym_cap, 1)
  /* The whole point of the policy: nothing is destroyed, so paying again is a
     webhook rather than a rebuild. */
  check('the gym itself is still there', lapsed.json.name, 'Billing Room')
  check('and still has its roster', (lapsed.json.operators ?? []).length, 1)

  console.log('\nstarting a checkout')
  await api('POST', '/api/collections/users/records',
    { email: 'nogym@enforma.test', password: 'passw0rd123', passwordConfirm: 'passw0rd123' }, su)
  const noGymAuth = await api('POST', '/api/collections/users/auth-with-password',
    { identity: 'nogym@enforma.test', password: 'passw0rd123' })
  check('signed out cannot',
    (await api('POST', '/api/enforma/billing/checkout', { price: 'enf_sub_plus_eur_month' })).status, 401)
  check('an unknown price cannot',
    (await api('POST', '/api/enforma/billing/checkout',
      { price: 'enf_sub_gold_eur_month', origin: 'https://x.test' }, auth.json.token)).status, 400)
  check('somebody who owns no gym cannot',
    (await api('POST', '/api/enforma/billing/checkout',
      { price: 'enf_sub_plus_eur_month', origin: 'https://x.test' }, noGymAuth.json.token)).status, 403)
  check('and neither can one with no return address',
    (await api('POST', '/api/enforma/billing/checkout',
      { price: 'enf_sub_plus_eur_month' }, auth.json.token)).status, 400)
} finally {
  await pb.stop()
}

console.log(failures === 0 ? '\nall clear\n' : `\n${failures} failed\n`)
process.exit(failures === 0 ? 0 : 1)
