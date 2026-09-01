/// <reference path="../pb_data/types.d.ts" />
/**
 * Which plan a gym is on.
 *
 * `/for-gyms` sells two of them and the product had no idea either existed:
 * `gyms` held a name, an operators list and a kind, and every gym got every
 * feature. The kitchen — the thing the page charges €100 a month more for —
 * was on for anybody with a gym at all. A pricing page describing a product
 * that does not distinguish its plans is a pricing page that is wrong in the
 * expensive direction as soon as somebody pays the lower one.
 *
 * So this is the gate everything else hangs off. It is deliberately a plain
 * text field set by hand: there is no Stripe, invoicing is a human writing an
 * invoice, and a subscription state machine with no payments behind it would be
 * a mechanism pretending to be a fact.
 *
 * **Existing gyms are grandfathered onto `plus`.** They were set up when
 * everything was included, some of them are using the kitchen today, and a
 * migration is not the place to take a working feature off a live customer.
 * New gyms start on `base`, and moving somebody is one field.
 */
migrate(
  (app) => {
    const gyms = app.findCollectionByNameOrId('gyms')
    gyms.fields.add(new Field({ name: 'plan', type: 'text', max: 8 }))
    app.save(gyms)

    for (const gym of app.findAllRecords('gyms')) {
      /* The house is not a gym and is not on a plan; leaving it blank keeps it
         out of every plan check rather than giving it a tier it cannot use. */
      if (gym.get('kind') === 'house') continue
      gym.set('plan', 'plus')
      app.save(gym)
    }
  },
  (app) => {
    const gyms = app.findCollectionByNameOrId('gyms')
    gyms.fields.removeByName('plan')
    app.save(gyms)
  },
)
