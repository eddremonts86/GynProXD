/// <reference path="../pb_data/types.d.ts" />
/**
 * A gym's colour in its members' app.
 *
 * One text field. What it deliberately is not is a theme: the app's own chrome
 * keeps the app's own colours, because the shell is where a member learns whose
 * app holds their encrypted training, and a shell wearing the gym would tell
 * them — plausibly and wrongly — that the gym holds it. The colour marks the
 * gym's own surfaces and nothing else. The landing card was rewritten to say
 * that rather than promise the shell.
 *
 * Readable by anybody who can already read the gym row, which is how a member's
 * app learns it: `gyms` is already listable by an authenticated account, and the
 * colour is the least private thing a gym has — it is on their door.
 *
 * Set through `/api/enforma/gym/set-brand`, because `gyms.updateRule` is null
 * and stays null: a gym row carries the operators list and the plan, and opening
 * it for one field would open it for those.
 */
migrate(
  (app) => {
    const gyms = app.findCollectionByNameOrId('gyms')
    gyms.fields.add(new Field({ name: 'brand_color', type: 'text', max: 7 }))
    app.save(gyms)
  },
  (app) => {
    const gyms = app.findCollectionByNameOrId('gyms')
    gyms.fields.removeByName('brand_color')
    app.save(gyms)
  },
)
