/// <reference path="../pb_data/types.d.ts" />
/**
 * Billing state, kept where the subscription actually belongs.
 *
 * `1757900000_gym_plan.js` said why `gyms.plan` was a plain text field somebody
 * set by hand: there was no Stripe, invoicing was a human writing an invoice,
 * and a subscription state machine with no payments behind it is a mechanism
 * pretending to be a fact. There are payments behind it now, so the fact
 * arrives and the mechanism is allowed.
 *
 * **On the owner, not on the gym.** One Enterprise subscription covers several
 * rooms, so a subscription cannot hang off a single `gyms` row without one of
 * five rooms holding the truth for the other four. It hangs off the account
 * that owns them, which is also the account Stripe is billing.
 *
 * `gyms.plan` and `users.gym_cap` stay exactly what they were and stay the only
 * things anything reads. Nothing in the product asks Stripe a question: the
 * webhook writes those two fields and every gate keeps reading them, so a
 * Stripe outage cannot decide whether a gym may publish.
 *
 * Readable only by the account it describes, because `users` is
 * `id = @request.auth.id`. Nobody needs to know what anybody else pays.
 */
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('users')
    users.fields.add(new Field({ name: 'stripe_customer', type: 'text', max: 64 }))
    users.fields.add(new Field({ name: 'stripe_subscription', type: 'text', max: 64 }))
    /* Stripe's own words, stored as they arrive: active, past_due, canceled,
       unpaid, trialing. Not translated into a local vocabulary, because the day
       somebody debugs a billing question they will be reading the Stripe
       dashboard next to this field. */
    users.fields.add(new Field({ name: 'billing_status', type: 'text', max: 24 }))
    app.save(users)
  },
  (app) => {
    const users = app.findCollectionByNameOrId('users')
    for (const name of ['stripe_customer', 'stripe_subscription', 'billing_status']) {
      users.fields.removeByName(name)
    }
    app.save(users)
  },
)
