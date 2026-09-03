/// <reference path="../pb_data/types.d.ts" />
/**
 * The webhook ledger, and the one field that ties an invoice to an account.
 *
 * `billing_events` exists for exactly one reason: Stripe delivers a webhook at
 * least once, and sometimes more than once. A duplicate
 * `checkout.session.completed` must not buy two months. The unique index on
 * `(livemode, event_id)` IS the idempotency mechanism — the handler inserts
 * before it does any work, and a constraint violation is the signal that this
 * event has already been applied. builderhunt's
 * `docs/operations/stripe-webhooks.md` reached the same shape and is worth
 * reading before touching this.
 *
 * `livemode` is part of the key rather than an ordinary column because test and
 * live mode number their events in separate spaces: the same id can legally
 * arrive in both, and a unique index on the id alone would make a test event
 * silently swallow its live twin.
 *
 * `users.stripe_customer` is why this migration cannot wait for a later one.
 * `invoice.paid` carries a customer and no `client_reference_id`, so after the
 * first payment the only route from a renewal back to an account is through
 * this field. Not writable by the account that owns it: the guard in
 * `member_pro.pb.js` covers it, because an account that could claim somebody
 * else's customer id would be pointing their renewals at itself.
 *
 * What is deliberately not stored: no card, no amount, no email, no payment
 * method, nothing about a person. A type, an id, a flag and whether it was
 * handled. This is a ledger to answer "did we already apply this", not a copy
 * of anybody's billing history — Stripe holds that and holds it better.
 */
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('users')

    users.fields.add(new Field({ name: 'stripe_customer', type: 'text', max: 64 }))
    app.save(users)

    const events = new Collection({
      type: 'base',
      name: 'billing_events',
      /* Platform admins only, through the same collection check the recipe
         admin routes use. A member has no use for this. */
      listRule: "@request.auth.id != '' && @collection.platform_admins.owner ?= @request.auth.id",
      viewRule: "@request.auth.id != '' && @collection.platform_admins.owner ?= @request.auth.id",
      /* Written by the webhook with a privileged save and by nothing else. A
         client that could write here could tell us an event was handled. */
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        { name: 'event_id', type: 'text', required: true, max: 80 },
        { name: 'livemode', type: 'bool' },
        { name: 'type', type: 'text', max: 64 },
        {
          name: 'owner',
          type: 'relation',
          required: false,
          collectionId: users.id,
          cascadeDelete: true,
          maxSelect: 1,
        },
        /* False means received and not applied, which is a thing a person needs
           to be able to see. A period end we could not read leaves the row
           here rather than inventing a date. */
        { name: 'handled', type: 'bool' },
        { name: 'note', type: 'text', max: 200 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE UNIQUE INDEX `idx_billing_events_id` ON `billing_events` (`livemode`, `event_id`)',
      ],
    })
    app.save(events)
  },
  (app) => {
    const users = app.findCollectionByNameOrId('users')
    users.fields.removeByName('stripe_customer')
    app.save(users)
    app.delete(app.findCollectionByNameOrId('billing_events'))
  },
)
