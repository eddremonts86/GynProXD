/// <reference path="../pb_data/types.d.ts" />
/**
 * Stripe: the checkout a gym owner starts, and the webhook that is the only
 * thing allowed to change what they have paid for.
 *
 * The shape is deliberately one-directional. Nothing in this product ever asks
 * Stripe a question: the webhook writes `gyms.plan` and `users.gym_cap`, and
 * every gate in the app keeps reading those two fields exactly as it did when a
 * human set them by hand. So a Stripe outage cannot decide whether a gym may
 * publish tonight, and the plan check has no network call in it.
 *
 * Both routes refuse to exist without keys, rather than half-working: a
 * checkout that cannot reach Stripe and a webhook that cannot verify a
 * signature are worse than a 503 that says so.
 */

/**
 * Start a subscription. The owner of a gym, and nobody else.
 *
 * An operator who is not the owner is refused for the same reason they cannot
 * change the roster: the account belongs to whoever moves first otherwise.
 */
routerAdd('POST', '/api/enforma/billing/checkout', (e) => {
  if (!e.auth) return e.json(401, { message: 'Sign in first.' })

  const secret = $os.getenv('STRIPE_SECRET_KEY')
  if (!secret) return e.json(503, { message: 'No billing on this server.' })

  const body = e.requestInfo().body || {}
  const lookup = String(body.price || '')
  const { entitlementFor, gymsOwnedBy } = require(`${__hooks}/utils/billing.js`)
  if (!entitlementFor(lookup)) return e.json(400, { message: 'Unknown price.' })

  /* Owning a gym is the thing being billed, so it is also the thing that
     authorises the checkout. No gym, no subscription to start. */
  if (gymsOwnedBy(e.app, e.auth.id).length === 0) {
    return e.json(403, { message: 'Only the owner of a gym can start a subscription.' })
  }

  const origin = String(body.origin || '').replace(/\/+$/, '')
  if (!/^https?:\/\//.test(origin)) return e.json(400, { message: 'Where should Stripe send them back to?' })

  /* A customer per account, reused. Two customers for one account is two
     invoices for one gym, and the second one is the surprise. */
  let customer = String(e.auth.get('stripe_customer') || '')
  const form = (pairs) => pairs.map((p) => p[0] + '=' + encodeURIComponent(p[1])).join('&')
  try {
    if (!customer) {
      const made = $http.send({
        url: 'https://api.stripe.com/v1/customers',
        method: 'POST',
        body: form([['email', String(e.auth.get('email') || '')], ['metadata[enforma_user]', e.auth.id]]),
        headers: {
          /* Bearer, not Basic: Stripe accepts the secret key either way and
             this runtime has no base64 encoder. */
          authorization: 'Bearer ' + secret,
          'content-type': 'application/x-www-form-urlencoded',
        },
        timeout: 30,
      })
      customer = String((made.json || {}).id || '')
      if (!customer) return e.json(502, { message: 'Stripe would not open an account.' })
      const row = e.app.findRecordById('users', e.auth.id)
      row.set('stripe_customer', customer)
      e.app.save(row)
    }

    /* The price id is resolved here rather than sent by the client. A client
       that names a Stripe price id can name any price in the account, which on
       a shared account is another project's, and it would have to be updated
       every time somebody edits an amount. The lookup key is stable and the
       allowlist above already vouched for it. */
    const priced = $http.send({
      url: 'https://api.stripe.com/v1/prices?lookup_keys[]=' + encodeURIComponent(lookup) + '&active=true',
      method: 'GET',
      headers: { authorization: 'Bearer ' + secret },
      timeout: 30,
    })
    const priceId = String((((priced.json || {}).data || [])[0] || {}).id || '')
    if (!priceId) return e.json(502, { message: 'That price is not set up in Stripe.' })

    const session = $http.send({
      url: 'https://api.stripe.com/v1/checkout/sessions',
      method: 'POST',
      body: form([
        ['mode', 'subscription'],
        ['customer', customer],
        ['line_items[0][price]', priceId],
        ['line_items[0][quantity]', '1'],
        ['success_url', origin + '/gym?billing=done'],
        ['cancel_url', origin + '/gym?billing=cancelled'],
        ['subscription_data[metadata][enforma_user]', e.auth.id],
        ['subscription_data[metadata][lookup]', lookup],
      ]),
      headers: {
        authorization: 'Bearer ' + secret,
        'content-type': 'application/x-www-form-urlencoded',
      },
      timeout: 30,
    })
    const url = String((session.json || {}).url || '')
    if (!url) return e.json(502, { message: 'Stripe would not open a checkout.' })
    return e.json(200, { url: url })
  } catch {
    /* Reached or not, the answer to the gym is the same and the key is never
       in it. */
    return e.json(502, { message: 'Stripe could not be reached.' })
  }
})

/**
 * The webhook, which is the only writer of what a gym has paid for.
 *
 * Verified before it is read. An unverified body is somebody claiming a
 * customer upgraded, and this route is the one place in the product where
 * believing that costs money.
 */
routerAdd('POST', '/api/enforma/billing/webhook', (e) => {
  const secret = $os.getenv('STRIPE_WEBHOOK_SECRET')
  if (!secret) return e.json(503, { message: 'No billing on this server.' })

  const { signatureOk, entitlementFor, isLapsed, gymsOwnedBy } = require(`${__hooks}/utils/billing.js`)

  /* The raw bytes, not a re-serialised object: the signature covers the body
     Stripe sent, and JSON.stringify of a parsed copy is a different string. */
  const raw = toString(e.request.body)
  const header = e.request.header.get('Stripe-Signature')
  if (!signatureOk(header, raw, secret, Math.floor(Date.now() / 1000), 300)) {
    return e.json(400, { message: 'Bad signature.' })
  }

  let event
  try {
    event = JSON.parse(raw)
  } catch {
    return e.json(400, { message: 'Unreadable body.' })
  }

  const object = ((event || {}).data || {}).object || {}
  const type = String((event || {}).type || '')

  /* Which account this is about, from metadata we set ourselves at checkout
     rather than from an email, which a person can change under us. */
  const meta = object.metadata || {}
  const userId = String(meta.enforma_user || '')
  if (!userId) return e.json(200, { ok: true, note: 'not an enForma subscription' })

  let owner
  try {
    owner = e.app.findRecordById('users', userId)
  } catch {
    return e.json(200, { ok: true, note: 'no such account' })
  }

  const status = String(object.status || '')
  const lookup = String(meta.lookup || '')
  const gyms = gymsOwnedBy(e.app, userId)

  if (type === 'customer.subscription.deleted' || isLapsed(status)) {
    /* Nothing is deleted. The paid surfaces go and everything the gym made
       stays, so paying again is a webhook rather than a rebuild. */
    owner.set('billing_status', status || 'canceled')
    owner.set('gym_cap', 1)
    e.app.save(owner)
    for (let i = 0; i < gyms.length; i++) {
      gyms[i].set('plan', 'base')
      e.app.save(gyms[i])
    }
    return e.json(200, { ok: true, applied: 'lapsed' })
  }

  const entitlement = entitlementFor(lookup)
  if (!entitlement) {
    owner.set('billing_status', status)
    e.app.save(owner)
    return e.json(200, { ok: true, note: 'no entitlement for that price' })
  }

  owner.set('billing_status', status)
  owner.set('stripe_subscription', String(object.id || ''))
  /* Never lowered by an upgrade path: an Enterprise account that already had a
     hand-set cap of eight keeps eight. Only lapsing lowers it. */
  const currentCap = Number(owner.get('gym_cap')) || 1
  owner.set('gym_cap', Math.max(currentCap, entitlement.cap))
  e.app.save(owner)

  for (let i = 0; i < gyms.length; i++) {
    gyms[i].set('plan', entitlement.plan)
    e.app.save(gyms[i])
  }
  return e.json(200, { ok: true, applied: entitlement.plan, cap: entitlement.cap })
})
