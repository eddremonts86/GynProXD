/// <reference path="../pb_data/types.d.ts" />
/**
 * Movements withdrawn from the library, whichever catalogue they came from.
 *
 * `exercises.published` only ever covered the rows written in the panel. The
 * other 2,076 — free-exercise-db, RepDB, wger — are generated files inside the
 * app bundle, and there is no field on them to flip: a release is the only way
 * to change them, and their ids are frozen because logged workouts point at
 * them. So withdrawal is recorded here instead, as a list of ids, and applied
 * where the library is assembled.
 *
 * It hides; it does not delete. `exerciseById` still resolves a hidden id, so
 * somebody's history keeps saying "Barbell Bench Press" rather than turning
 * into a row of unknown ids the day an admin retires the movement.
 */
const AUTHED = "@request.auth.id != ''"
const IS_ADMIN = `${AUTHED} && @collection.platform_admins.owner ?= @request.auth.id`

migrate(
  (app) => {
    const hidden = new Collection({
      type: 'base',
      name: 'exercises_hidden',
      listRule: AUTHED,
      viewRule: AUTHED,
      createRule: IS_ADMIN,
      updateRule: IS_ADMIN,
      deleteRule: IS_ADMIN,
      fields: [
        /* Any id the app knows: `Barbell_Curl`, `wger-46`, `srv-abc123`. */
        { name: 'exerciseId', type: 'text', required: true, max: 200 },
        /* What the movement was called when it was hidden, so the panel can
           list it without loading a catalogue it may not have. */
        { name: 'name', type: 'text', max: 200 },
        /* Why, for whoever finds it hidden a year from now. */
        { name: 'reason', type: 'text', max: 300 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
      ],
      indexes: ['CREATE UNIQUE INDEX `idx_hidden_exercise` ON `exercises_hidden` (`exerciseId`)'],
    })
    app.save(hidden)
  },
  (app) => {
    app.delete(app.findCollectionByNameOrId('exercises_hidden'))
  },
)
