/// <reference path="../pb_data/types.d.ts" />
/**
 * Phase 5: the gym bus leaves the device, plus the key-wrap column that makes
 * password reset cheap.
 *
 * `gyms` are created only by the platform superuser — being a gym is a
 * verified (and eventually paid) status, never self-assigned. Operators are
 * user accounts listed on the gym row. `users.gym` is a member's chosen gym;
 * members set it themselves. `gym_messages` carries the same message shapes
 * the device bus uses, addressed by gym: operators write (enforced by the
 * companion hook), members of that gym and its operators read.
 *
 * `sync_state.wrapped_dk` holds the random data key wrapped by the
 * password-derived KEK; the recovery code wraps the same key in
 * `wrapped_key`. Rotating the password re-wraps one blob and touches no row.
 */
const AUTHED = "@request.auth.id != ''"

migrate(
  (app) => {
    const syncState = app.findCollectionByNameOrId('sync_state')
    syncState.fields.add(new Field({ name: 'wrapped_dk', type: 'json', maxSize: 4000 }))
    app.save(syncState)

    const gyms = new Collection({
      type: 'base',
      name: 'gyms',
      listRule: AUTHED,
      viewRule: AUTHED,
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        { name: 'name', type: 'text', required: true, max: 80 },
        {
          name: 'operators',
          type: 'relation',
          collectionId: '_pb_users_auth_',
          cascadeDelete: false,
          maxSelect: 99,
        },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE UNIQUE INDEX `idx_gyms_name` ON `gyms` (`name`)'],
    })
    app.save(gyms)

    const users = app.findCollectionByNameOrId('users')
    users.fields.add(
      new Field({
        name: 'gym',
        type: 'relation',
        collectionId: gyms.id,
        cascadeDelete: false,
        maxSelect: 1,
      }),
    )
    app.save(users)

    const readRule = `${AUTHED} && (gym = @request.auth.gym || gym.operators.id ?= @request.auth.id)`
    const messages = new Collection({
      type: 'base',
      name: 'gym_messages',
      listRule: readRule,
      viewRule: readRule,
      /* Authorship is pinned here; "author must operate the gym" lives in the
         companion hook, where the draft's relations can actually be read. */
      createRule: `${AUTHED} && @request.body.author = @request.auth.id`,
      updateRule: null,
      deleteRule: `${AUTHED} && gym.operators.id ?= @request.auth.id`,
      fields: [
        {
          name: 'gym',
          type: 'relation',
          collectionId: gyms.id,
          required: true,
          cascadeDelete: true,
          maxSelect: 1,
        },
        {
          name: 'author',
          type: 'relation',
          collectionId: '_pb_users_auth_',
          required: true,
          maxSelect: 1,
        },
        { name: 'kind', type: 'text', required: true, max: 24 },
        { name: 'title', type: 'text', required: true, max: 200 },
        { name: 'body', type: 'text', max: 4000 },
        { name: 'payload', type: 'json', maxSize: 100000 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE INDEX `idx_gym_messages_gym_updated` ON `gym_messages` (`gym`, `updated`)'],
    })
    app.save(messages)
  },
  (app) => {
    app.delete(app.findCollectionByNameOrId('gym_messages'))
    const users = app.findCollectionByNameOrId('users')
    users.fields.removeByName('gym')
    app.save(users)
    app.delete(app.findCollectionByNameOrId('gyms'))
    const syncState = app.findCollectionByNameOrId('sync_state')
    syncState.fields.removeByName('wrapped_dk')
    app.save(syncState)
  },
)
