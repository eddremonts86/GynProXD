/// <reference path="../pb_data/types.d.ts" />
/**
 * Enterprise, which is a number rather than a level of the data model.
 *
 * The third column on the pricing page sells one account holding up to five
 * gyms. Behind it an account held exactly one, and provisioning five was five
 * gyms of manual work with nothing stopping a sixth. That is the only thing on
 * the backlog a customer could pay for and not get.
 *
 * `gyms.operators` is already a list *per gym*, and every rule that matters
 * asks "is this account in this gym's operators list". One account appearing in
 * five of those lists works today, with no migration and no rule touched. So
 * Enterprise is not an `orgs` collection with gyms pointing at it. It is a cap
 * on the account:
 *
 *   Plus         gym_cap 1, which is what every gym has now
 *   Enterprise   gym_cap 5
 *   More         the same field, set to whatever was agreed
 *
 * That last line is the argument for this shape. "Up to five" and "call us for
 * more" are the same feature differing by an integer, which is what was asked
 * for: as many as we like, configurable.
 *
 * An `orgs` row is the right shape the day something is genuinely org-wide: one
 * bill, reach across all five, a member belonging to the organisation rather
 * than to a branch. None of those exist, and until they do an org row is a hop
 * every rule has to make to answer a question it can already answer.
 */
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('users')
    /* Not required, so no row needs rewriting: absent reads as one everywhere
       it is checked, and one is what every existing account is. */
    users.fields.add(new Field({ name: 'gym_cap', type: 'number', onlyInt: true, min: 1 }))
    app.save(users)
  },
  (app) => {
    const users = app.findCollectionByNameOrId('users')
    users.fields.removeByName('gym_cap')
    app.save(users)
  },
)
