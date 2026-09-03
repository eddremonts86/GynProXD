/**
 * What a subscription means for what a gym may do.
 *
 * Two decisions live here, and both are product decisions rather than Stripe
 * ones, which is why they are in one readable place instead of scattered
 * through the webhook.
 *
 * **What each price buys.** Keyed by the Stripe price lookup key rather than
 * the price id, because a price id changes the day somebody edits an amount and
 * a lookup key does not. Enterprise is the only one that raises the cap: Base
 * and Plus are one room, which is what they have always been.
 *
 * **What happens when the money stops.** `canceled` and `unpaid` drop every gym
 * the account owns to `base` and the cap back to one. Nothing is deleted: the
 * roster, the history, the messages and the members all stay, and the day they
 * pay again the webhook puts the plan back. `past_due` changes nothing at all,
 * because Stripe is still retrying and taking a paying customer's kitchen away
 * over the first failed retry is how you turn a card that expired into a
 * cancellation.
 */
const PLANS = {
  enf_sub_base_eur_month: { plan: 'base', cap: 1 },
  enf_sub_plus_eur_month: { plan: 'plus', cap: 1 },
  enf_sub_enterprise_eur_month: { plan: 'plus', cap: 5 },
}

/** Statuses that mean the paid surfaces go away. `past_due` is not one. */
const LAPSED = ['canceled', 'unpaid', 'incomplete_expired']

function entitlementFor(lookupKey) {
  return PLANS[String(lookupKey || '')] ?? null
}

function isLapsed(status) {
  return LAPSED.indexOf(String(status || '')) !== -1
}

/**
 * Stripe's signature, verified.
 *
 * `t=…,v1=…` over `t.body` with HMAC-SHA256. Compared with `$security.equal`
 * rather than `===` so a wrong signature takes the same time to reject as a
 * right one, and the timestamp is checked so a captured payload cannot be
 * replayed a week later.
 */
function signatureOk(header, body, secret, nowSeconds, toleranceSeconds) {
  const parts = String(header || '').split(',')
  let t = ''
  const v1 = []
  for (let i = 0; i < parts.length; i++) {
    const pair = parts[i].split('=')
    if (pair[0] === 't') t = pair[1]
    if (pair[0] === 'v1') v1.push(pair[1])
  }
  if (!t || v1.length === 0) return false
  const age = Math.abs(nowSeconds - Number(t))
  if (!Number.isFinite(age) || age > toleranceSeconds) return false
  const expected = $security.hs256(t + '.' + body, secret)
  for (let i = 0; i < v1.length; i++) {
    if ($security.equal(expected, v1[i])) return true
  }
  return false
}

/** Every gym an account owns, which is what a subscription covers. */
function gymsOwnedBy(app, userId) {
  return app.findRecordsByFilter('gyms', 'owner = {:owner}', '', 0, 0, { owner: userId })
}

module.exports = { PLANS, LAPSED, entitlementFor, isLapsed, signatureOk, gymsOwnedBy }
