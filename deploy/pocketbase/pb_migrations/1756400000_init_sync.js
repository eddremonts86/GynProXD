/// <reference path="../pb_data/types.d.ts" />
/**
 * enForma sync schema.
 *
 * `records` holds one row per training record: plaintext metadata (owner,
 * collection, record id, client timestamps) and the body as an opaque
 * AES-GCM blob the server can never read. A deleted row keeps its metadata
 * and loses its blob — that is the tombstone other devices merge on.
 *
 * `sync_state` holds one row per account: the profile's KDF salt (so a new
 * device can derive the key from the passphrase), the encrypted passphrase
 * sentinel (to verify before pulling), and the data key wrapped under the
 * one-time recovery code shown at signup.
 *
 * Every rule is owner-only: an authenticated user reads and writes their own
 * rows and nobody else's. The gym bus stays out of this schema on purpose —
 * that is phase 5 and it has different access control.
 */
const OWNER_RULE = "@request.auth.id != '' && owner = @request.auth.id"
const CREATE_RULE = "@request.auth.id != '' && @request.body.owner = @request.auth.id"

migrate(
  (app) => {
    const records = new Collection({
      type: 'base',
      name: 'records',
      listRule: OWNER_RULE,
      viewRule: OWNER_RULE,
      createRule: CREATE_RULE,
      updateRule: OWNER_RULE,
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
        { name: 'col', type: 'text', required: true, max: 40 },
        { name: 'rid', type: 'text', required: true, max: 120 },
        { name: 'created_client', type: 'text', max: 40 },
        { name: 'updated_client', type: 'text', required: true, max: 40 },
        { name: 'deleted_client', type: 'text', max: 40 },
        { name: 'blob', type: 'json', maxSize: 2000000 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE UNIQUE INDEX `idx_records_owner_col_rid` ON `records` (`owner`, `col`, `rid`)',
        'CREATE INDEX `idx_records_owner_updated` ON `records` (`owner`, `updated`)',
      ],
    })
    app.save(records)

    const syncState = new Collection({
      type: 'base',
      name: 'sync_state',
      listRule: OWNER_RULE,
      viewRule: OWNER_RULE,
      createRule: CREATE_RULE,
      updateRule: OWNER_RULE,
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
        { name: 'salt', type: 'text', required: true, max: 64 },
        { name: 'iterations', type: 'number', required: true, onlyInt: true },
        { name: 'check', type: 'json', maxSize: 4000 },
        { name: 'wrapped_key', type: 'json', maxSize: 4000 },
        { name: 'recovery_salt', type: 'text', max: 64 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE UNIQUE INDEX `idx_sync_state_owner` ON `sync_state` (`owner`)'],
    })
    app.save(syncState)
  },
  (app) => {
    app.delete(app.findCollectionByNameOrId('records'))
    app.delete(app.findCollectionByNameOrId('sync_state'))
  },
)
