/// <reference path="../pb_data/types.d.ts" />
/**
 * Movements the platform writes itself.
 *
 * The bundled catalogue is generated from upstream datasets and frozen: its
 * ids are written into every logged workout, so a script owns those files and
 * nobody edits them by hand. That left no way to add the movement a gym
 * actually teaches, or to correct one, without a release. This collection is
 * that way — additive, never a replacement, and delivered to members the way
 * recipes already are.
 *
 * Read is open to any signed-in member: this is catalogue data with no vendor
 * terms and no clock on it, so there is nothing a hook would need to gate.
 * Write is platform-admin only, and `exercises_admin.pb.js` checks that what
 * arrives is complete — the panel is the client of PocketBase's own record API
 * so that file upload works without a bespoke endpoint.
 */
const AUTHED = "@request.auth.id != ''"
const IS_ADMIN = `${AUTHED} && @collection.platform_admins.owner ?= @request.auth.id`

migrate(
  (app) => {
    const exercises = new Collection({
      type: 'base',
      name: 'exercises',
      listRule: AUTHED,
      viewRule: AUTHED,
      createRule: IS_ADMIN,
      updateRule: IS_ADMIN,
      deleteRule: IS_ADMIN,
      fields: [
        { name: 'name', type: 'text', required: true, max: 120 },
        {
          name: 'muscle',
          type: 'select',
          required: true,
          maxSelect: 1,
          values: [
            'chest',
            'back',
            'shoulders',
            'biceps',
            'triceps',
            'quads',
            'hamstrings',
            'glutes',
            'calves',
            'core',
            'other',
          ],
        },
        {
          name: 'equipment',
          type: 'select',
          required: true,
          maxSelect: 1,
          values: [
            'barbell',
            'dumbbell',
            'bodyweight',
            'machine',
            'cable',
            'kettlebell',
            'band',
            'other',
          ],
        },
        {
          name: 'category',
          type: 'select',
          required: true,
          maxSelect: 1,
          values: ['strength', 'stretching', 'cardio', 'plyometrics', 'strongman', 'olympic'],
        },
        { name: 'instructions', type: 'json', maxSize: 20000 },
        /* One picture, downscaled by the client before it is sent. `maxSize`
           is a backstop against a raw camera dump, not the working limit. */
        {
          name: 'image',
          type: 'file',
          maxSelect: 1,
          maxSize: 3000000,
          mimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
          thumbs: ['600x0'],
        },
        /* A movement can be drafted before its photograph exists; only
           published rows reach members. */
        { name: 'published', type: 'bool' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE UNIQUE INDEX `idx_exercises_name` ON `exercises` (`name`)',
        'CREATE INDEX `idx_exercises_muscle` ON `exercises` (`muscle`)',
        'CREATE INDEX `idx_exercises_published` ON `exercises` (`published`)',
      ],
    })
    app.save(exercises)
  },
  (app) => {
    app.delete(app.findCollectionByNameOrId('exercises'))
  },
)
