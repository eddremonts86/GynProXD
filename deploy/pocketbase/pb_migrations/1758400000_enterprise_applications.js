/// <reference path="../pb_data/types.d.ts" />
/**
 * Room in the applications queue for the word "enterprise".
 *
 * `gym_applications.plan` was `max: 8`, which fits "base" and "plus" and
 * refuses "enterprise" by two characters. The alternative was storing a short
 * code — "ent" — and decoding it in the panel, and that is the wrong trade: the
 * queue is read by a person deciding what to provision, and the one thing that
 * must not be ambiguous is which tier somebody asked for. A three-letter code
 * needing a lookup table is exactly what gets misread while setting up an
 * account at the top of the price list.
 *
 * Nothing else changes. Existing rows hold "base" or "plus" and stay valid.
 */
migrate(
  (app) => {
    const applications = app.findCollectionByNameOrId('gym_applications')
    const plan = applications.fields.getByName('plan')
    plan.max = 12
    app.save(applications)
  },
  (app) => {
    const applications = app.findCollectionByNameOrId('gym_applications')
    /* Anything that would no longer fit goes first, or the field cannot narrow
       and the rollback fails on a row nobody is looking at. */
    for (const row of app.findAllRecords('gym_applications')) {
      if (String(row.get('plan') || '').length > 8) {
        row.set('plan', 'plus')
        app.save(row)
      }
    }
    const plan = applications.fields.getByName('plan')
    plan.max = 8
    app.save(applications)
  },
)
