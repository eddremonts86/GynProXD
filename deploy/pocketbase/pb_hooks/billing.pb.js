/// <reference path="../pb_data/types.d.ts" />
/**
 * The card. Two routes, and they are not symmetrical.
 *
 * `POST /api/enforma/checkout` is a member asking to pay. It is authenticated
 * the ordinary way and it does nothing but hand back a URL on Stripe's own
 * domain. **No card field exists anywhere in this codebase**, in any phase; the
 * Stripe customer id on the user row is the entire footprint we keep.
 *
 * `POST /api/enforma/stripe-webhook` is Stripe telling us something happened.
 * Nobody is signed in, so the signature IS the authentication — see
 * `utils/stripe_sig.js`, which is where that boundary lives and is tested.
 * Three rules, in this order, and the order is the design:
 *
 *   1. Read the raw body and verify the signature. Before anything is parsed,
 *      because the digest is over the bytes that arrived.
 *   2. Insert `(livemode, event_id)`. Before any work, because the unique
 *      index is the idempotency mechanism and a duplicate delivery has to lose
 *      the race rather than apply twice.
 *   3. Then, and only then, apply it.
 *
 * builderhunt's `docs/operations/stripe-webhooks.md` arrived at the same three
 * and is worth reading before changing them.
 *
 * PocketBase runs each handler in an isolated VM, so every `require` is inside
 * the handler that needs it.
 *
 * ## What VAT this does and does not handle
 *
 * `automatic_tax[enabled]=true` on the checkout session, so the **rate charged**
 * is right from the first sale. Registering for OSS in Denmark, remitting and
 * filing the quarterly return stay with the seller, from the first consumer
 * sale into the EU, and no configuration moves that. HunterReady's ADR-034
 * priced the alternative — a merchant of record — and Edd chose Stripe and took
 * the obligation. That decision is not re-made here; it is recorded so the next
 * person reading this route knows the return is somebody's job.
 */

/* -------------------------------------------------------------- checkout */

routerAdd('POST', '/api/enforma/checkout', (e) => {
  if (!e.auth) return e.json(401, { message: 'Sign in first.' })

  const key = $os.getenv('STRIPE_SECRET_KEY')
  const price = $os.getenv('STRIPE_PRICE_MONTHLY')
  if (!key || !price) return e.json(503, { message: 'This server does not sell subscriptions.' })

  /**
   * Where Stripe sends somebody back to.
   *
   * From the environment, and from the request's own Origin only as a fallback,
   * because a return URL taken from a header is a header an attacker controls.
   * Stripe will only redirect a browser it already sent, so this is not an open
   * redirect either way, but the configured value is the one to trust.
   */
  const origin = $os.getenv('APP_URL') || e.request.header.get('Origin') || ''
  if (!origin) return e.json(500, { message: 'This server does not know its own address.' })
  const base = String(origin).replace(/\/+$/, '')

  const form = [
    ['mode', 'subscription'],
    ['line_items[0][price]', price],
    ['line_items[0][quantity]', '1'],
    /* The rate charged is right from the first sale. The return is not ours. */
    ['automatic_tax[enabled]', 'true'],
    /* How `checkout.session.completed` finds the account again. */
    ['client_reference_id', e.auth.id],
    ['customer_email', e.auth.email()],
    ['success_url', `${base}/settings?paid=1`],
    ['cancel_url', `${base}/settings`],
  ]
  const customer = String(e.auth.get('stripe_customer') || '')
  /* A member who has paid before keeps their customer, so Stripe does not grow
     a second one for the same person on every renewal of a lapsed account. */
  if (customer) form.push(['customer', customer])

  const body = form
    .map((pair) => `${encodeURIComponent(pair[0])}=${encodeURIComponent(pair[1])}`)
    .join('&')

  let res = null
  try {
    res = $http.send({
      url: 'https://api.stripe.com/v1/checkout/sessions',
      method: 'POST',
      body: body,
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        authorization: 'Bearer ' + key,
        /* Stripe deduplicates on this, so a member double-tapping the button
           gets one session rather than two. */
        'idempotency-key': 'checkout-' + e.auth.id + '-' + Math.floor(Date.now() / 60000),
      },
      timeout: 20,
    })
  } catch {
    return e.json(502, { message: 'Stripe could not be reached.' })
  }

  if (res.statusCode < 200 || res.statusCode >= 300) {
    /* Stripe's own message is not shown to the member: it is written for a
       developer and can name our price ids. */
    $app.logger().error('stripe checkout failed', 'status', res.statusCode)
    return e.json(502, { message: 'Stripe refused to open a checkout.' })
  }
  const url = res.json && res.json.url
  if (!url) return e.json(502, { message: 'Stripe opened no checkout.' })
  return e.json(200, { url: url })
})

/* --------------------------------------------------------------- webhook */

routerAdd('POST', '/api/enforma/stripe-webhook', (e) => {
  const sig = require(`${__hooks}/utils/stripe_sig.js`)

  /* 1. The bytes, then the signature. Nothing above this line parses. */
  const raw = readerToString(e.request.body)
  const secrets = [
    $os.getenv('STRIPE_WEBHOOK_SECRET'),
    /* Set only while an endpoint secret is being rotated. */
    $os.getenv('STRIPE_WEBHOOK_SECRET_PREVIOUS'),
  ]
  const verified = sig.verifyStripeSignature({
    header: e.request.header.get('Stripe-Signature'),
    body: raw,
    secrets: secrets,
    nowSec: Math.floor(Date.now() / 1000),
    hmac: (text, secret) => $security.hs256(text, secret),
    equal: (a, b) => $security.equal(a, b),
  })
  if (!verified.ok) {
    $app.logger().warn('stripe webhook refused', 'reason', verified.reason)
    /* 400 rather than 401: there is no credential to re-present, and Stripe
       reads any non-2xx as "retry" either way. */
    return e.json(400, { message: 'Bad signature.' })
  }

  let event = null
  try {
    event = JSON.parse(raw)
  } catch {
    return e.json(400, { message: 'Not JSON.' })
  }
  const eventId = String((event && event.id) || '')
  const type = String((event && event.type) || '')
  if (!eventId) return e.json(400, { message: 'No event id.' })

  /**
   * The mode has to match the key this server holds.
   *
   * A test-mode server applying a live event, or a live one refusing real
   * money, are both worse than refusing to decide — and a key we cannot read
   * the mode of is the second case. Derived from the key rather than
   * configured, so there is no second variable to disagree with the first.
   */
  const expected = sig.livemodeOf($os.getenv('STRIPE_SECRET_KEY'))
  const livemode = (event && event.livemode) === true
  if (expected === null || livemode !== expected) {
    $app.logger().warn('stripe webhook livemode mismatch', 'event', eventId)
    return e.json(400, { message: 'Wrong mode for this server.' })
  }

  /**
   * 2. The ledger row, before any work.
   *
   * This insert is the idempotency mechanism, not a log of it. Stripe delivers
   * at least once and sometimes twice; the unique index on
   * `(livemode, event_id)` means the second delivery fails here and returns
   * 200 without touching anybody's subscription. Doing this after the work is
   * how a redelivery buys a second month.
   */
  const ledger = e.app.findCollectionByNameOrId('billing_events')
  const row = new Record(ledger)
  row.set('event_id', eventId)
  row.set('livemode', livemode)
  row.set('type', type)
  row.set('handled', false)
  try {
    e.app.save(row)
  } catch {
    /* Already applied. 200, so Stripe stops retrying something that is done. */
    return e.json(200, { ok: true, duplicate: true })
  }

  /* 3. Apply it. */
  const object = (event.data && event.data.object) || {}
  const finish = (owner, handled, note) => {
    try {
      if (owner) row.set('owner', owner)
      row.set('handled', handled === true)
      if (note) row.set('note', String(note).slice(0, 200))
      e.app.save(row)
    } catch {
      /* The work is done; failing to annotate it is not a reason to make
         Stripe retry and take the duplicate path next time. */
    }
    return e.json(200, { ok: true })
  }

  /** The account this event is about, by whichever route the event offers. */
  const findOwner = () => {
    const reference = String(object.client_reference_id || '')
    if (reference) {
      try {
        return e.app.findRecordById('users', reference)
      } catch {
        /* Falls through to the customer id. */
      }
    }
    const customer = String(object.customer || '')
    if (!customer) return null
    try {
      return e.app.findFirstRecordByFilter('users', 'stripe_customer = {:c}', { c: customer })
    } catch {
      return null
    }
  }

  if (type === 'checkout.session.completed') {
    const user = findOwner()
    if (!user) return finish(null, false, 'no account for this session')
    const customer = String(object.customer || '')
    /* The link that makes every later renewal findable: `invoice.paid` carries
       a customer and no client_reference_id. */
    if (customer) user.set('stripe_customer', customer)
    user.set('pro_source', 'stripe')
    e.app.save(user)
    return finish(user.id, true, 'customer linked')
  }

  if (type === 'invoice.paid' || type === 'invoice_payment.paid') {
    const user = findOwner()
    if (!user) return finish(null, false, 'no account for this invoice')

    /**
     * The period end is the truth, and it is read rather than computed.
     *
     * `lines.data[0].period.end` is a unix timestamp on the invoice, which is
     * what the subscription is actually paid to. Adding a month to today would
     * be a second opinion about a fact Stripe already holds, and it would
     * drift by a day every renewal.
     *
     * When it cannot be read, nothing is written. The row stays `handled:
     * false` with a note, which is a thing a person can see and act on — a
     * fallback that invented a date is the kind of thing that goes wrong
     * quietly and for money.
     */
    let end = 0
    try {
      const lines = (object.lines && object.lines.data) || []
      for (const line of lines) {
        const at = line && line.period && Number(line.period.end)
        if (Number.isFinite(at) && at > end) end = at
      }
    } catch {
      end = 0
    }
    if (!end) return finish(user.id, false, 'no period end on the invoice')

    const until = new Date(end * 1000).toISOString().replace('T', ' ')
    user.set('pro_until', until)
    user.set('pro_source', 'stripe')
    e.app.save(user)
    return finish(user.id, true, 'paid to ' + until.slice(0, 10))
  }

  /**
   * Everything else is recorded and does nothing, and that is not laziness.
   *
   * A cancelled subscription needs no action: `pro_until` is a date and it
   * expires because time passes. There is no state machine here to move, which
   * is the whole reason the entitlement was shaped as one field.
   */
  return finish(null, true, 'recorded, no action')
})
