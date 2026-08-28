/// <reference path="../pb_data/types.d.ts" />
/**
 * Membership and platform admin.
 *
 * Until now `users.gym` was self-writable, so anyone could join any gym and
 * read its bus. Membership is now established two ways, both server-checked
 * (see pb_hooks/membership.pb.js): a join CODE the gym shares (instant), or an
 * approval REQUEST the operator confirms. Direct writes to `users.gym` are
 * refused; only the privileged routes set it.
 *
 * `gym_secrets` holds each gym's join code, readable by nobody through the API
 * (only the hooks, privileged) — a code that everyone could read would gate
 * nothing. `platform_admins` marks accounts that carry the app admin role onto
 * every device they sign into; only the superuser grants it, each account can
 * see its own row. `gym_join_requests` is the approval queue.
 */
const AUTHED = "@request.auth.id != ''"

migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('users')
    const gyms = app.findCollectionByNameOrId('gyms')

    const secrets = new Collection({
      type: 'base',
      name: 'gym_secrets',
      listRule: null,
      viewRule: null,
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        {
          name: 'gym',
          type: 'relation',
          required: true,
          collectionId: gyms.id,
          cascadeDelete: true,
          maxSelect: 1,
        },
        { name: 'code', type: 'text', required: true, max: 40 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE UNIQUE INDEX `idx_gym_secrets_gym` ON `gym_secrets` (`gym`)'],
    })
    app.save(secrets)

    const admins = new Collection({
      type: 'base',
      name: 'platform_admins',
      // A user can see whether they themselves are an admin; nobody writes here
      // but the superuser (dashboard or scripts/admin).
      listRule: `${AUTHED} && owner = @request.auth.id`,
      viewRule: `${AUTHED} && owner = @request.auth.id`,
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        {
          name: 'owner',
          type: 'relation',
          required: true,
          collectionId: users.id,
          cascadeDelete: true,
          maxSelect: 1,
        },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
      ],
      indexes: ['CREATE UNIQUE INDEX `idx_platform_admins_owner` ON `platform_admins` (`owner`)'],
    })
    app.save(admins)

    const requests = new Collection({
      type: 'base',
      name: 'gym_join_requests',
      // The requester sees their own; the gym's operators see requests for it.
      listRule: `${AUTHED} && (owner = @request.auth.id || gym.operators.id ?= @request.auth.id)`,
      viewRule: `${AUTHED} && (owner = @request.auth.id || gym.operators.id ?= @request.auth.id)`,
      // A user files their own request, always starting pending.
      createRule: `${AUTHED} && @request.body.owner = @request.auth.id && @request.body.status = 'pending'`,
      // Only the gym's operators decide; the approval side effect is a hook.
      updateRule: `${AUTHED} && gym.operators.id ?= @request.auth.id`,
      deleteRule: `${AUTHED} && (owner = @request.auth.id || gym.operators.id ?= @request.auth.id)`,
      fields: [
        {
          name: 'owner',
          type: 'relation',
          required: true,
          collectionId: users.id,
          cascadeDelete: true,
          maxSelect: 1,
        },
        {
          name: 'gym',
          type: 'relation',
          required: true,
          collectionId: gyms.id,
          cascadeDelete: true,
          maxSelect: 1,
        },
        { name: 'status', type: 'text', required: true, max: 12 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE UNIQUE INDEX `idx_gym_join_requests_owner_gym` ON `gym_join_requests` (`owner`, `gym`)',
      ],
    })
    app.save(requests)
  },
  (app) => {
    for (const name of ['gym_join_requests', 'platform_admins', 'gym_secrets']) {
      try {
        app.delete(app.findCollectionByNameOrId(name))
      } catch {
        /* already gone */
      }
    }
  },
)
