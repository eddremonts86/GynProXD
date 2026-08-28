/// <reference path="../pb_data/types.d.ts" />
/**
 * Phase 6/7 storage. `push_subs` holds one Web Push subscription per device,
 * owner-scoped; the push service reads them privileged and deletes the ones
 * the push gateway reports gone. `shared_cache` backs the server-side shared
 * fetches (daily dish, recipe search): hooks read and write it privileged,
 * clients never touch it directly.
 */
const OWNER_RULE = "@request.auth.id != '' && owner = @request.auth.id"

migrate(
  (app) => {
    const subs = new Collection({
      type: 'base',
      name: 'push_subs',
      listRule: OWNER_RULE,
      viewRule: OWNER_RULE,
      createRule: "@request.auth.id != '' && @request.body.owner = @request.auth.id",
      updateRule: null,
      deleteRule: OWNER_RULE,
      fields: [
        {
          name: 'owner',
          type: 'relation',
          required: true,
          collectionId: '_pb_users_auth_',
          cascadeDelete: true,
          maxSelect: 1,
        },
        { name: 'endpoint', type: 'text', required: true, max: 1000 },
        { name: 'p256dh', type: 'text', required: true, max: 200 },
        { name: 'auth', type: 'text', required: true, max: 100 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE UNIQUE INDEX `idx_push_subs_endpoint` ON `push_subs` (`endpoint`)'],
    })
    app.save(subs)

    const cache = new Collection({
      type: 'base',
      name: 'shared_cache',
      listRule: null,
      viewRule: null,
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        { name: 'key', type: 'text', required: true, max: 500 },
        { name: 'value', type: 'json', maxSize: 500000 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE UNIQUE INDEX `idx_shared_cache_key` ON `shared_cache` (`key`)'],
    })
    app.save(cache)
  },
  (app) => {
    app.delete(app.findCollectionByNameOrId('push_subs'))
    app.delete(app.findCollectionByNameOrId('shared_cache'))
  },
)
