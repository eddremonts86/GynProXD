/// <reference path="../pb_data/types.d.ts" />
/**
 * A gym asking to be set up.
 *
 * Gyms cannot be created through the app and should not be: `gyms.createRule`
 * is null, so only a superuser makes one, and the provisioning script stays the
 * way it is done. That is correct — a gym is a paying account with a member
 * roster, not something a form conjures — but it left the new landing page with
 * a call to action and nowhere to send it.
 *
 * So this is the front door, and it is deliberately only a door. A row here
 * grants nothing: no gym, no operator, no reach. Somebody reads it and runs the
 * same script they ran before.
 *
 * `owner` is required, which is what enforces "gyms are sync accounts". An
 * application needs an account, so there is no anonymous write here to spam —
 * and the account is the one thing we will need anyway, since it becomes the
 * operator. The alternative was a public form plus rate limiting, which is more
 * moving parts guarding a worse shape.
 */
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('users')

    const applications = new Collection({
      type: 'base',
      name: 'gym_applications',
      /* An applicant sees their own; a platform admin sees all of them. Nobody
         sees anybody else's, because a rival's contact details and member count
         are exactly what this collection is full of. */
      listRule:
        "@request.auth.id != '' && (owner = @request.auth.id || @collection.platform_admins.owner ?= @request.auth.id)",
      viewRule:
        "@request.auth.id != '' && (owner = @request.auth.id || @collection.platform_admins.owner ?= @request.auth.id)",
      /* Signed in, and only for yourself. `status` is pinned to 'new' here so
         an applicant cannot arrive pre-approved. */
      createRule:
        "@request.auth.id != '' && @request.body.owner = @request.auth.id && @request.body.status = 'new'",
      /* Only an admin moves it along. An applicant editing their own row after
         the fact would be editing a record somebody has already acted on. */
      updateRule: "@request.auth.id != '' && @collection.platform_admins.owner ?= @request.auth.id",
      deleteRule: "@request.auth.id != '' && @collection.platform_admins.owner ?= @request.auth.id",
      fields: [
        {
          name: 'owner',
          type: 'relation',
          required: true,
          collectionId: users.id,
          cascadeDelete: true,
          maxSelect: 1,
        },
        { name: 'gym_name', type: 'text', required: true, min: 2, max: 80 },
        { name: 'contact', type: 'text', required: true, min: 2, max: 80 },
        /* Their own address to reply to, which is not necessarily the one the
           account was opened with. */
        { name: 'email', type: 'email', required: true },
        { name: 'phone', type: 'text', max: 40 },
        { name: 'city', type: 'text', max: 80 },
        /* A band rather than a number: nobody knows their member count to the
           unit, and a text field would collect "about 300ish". */
        { name: 'size', type: 'text', max: 20 },
        /* Which plan they came for. Not binding, and useful: it says whether
             the page sold the thing we thought it sold. */
        { name: 'plan', type: 'text', max: 8 },
        { name: 'note', type: 'text', max: 2000 },
        /* new → contacted → provisioned, or declined. Text rather than select
           so a state can be added without a migration for a workflow that has
           not settled yet. */
        { name: 'status', type: 'text', required: true, max: 12 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX `idx_gym_applications_status` ON `gym_applications` (`status`, `created`)',
        /* One open application per account. A gym that applies twice by
           double-clicking should not become two rows for somebody to
           reconcile; re-applying after a decline is a new row because the old
           one is no longer 'new'. */
        "CREATE UNIQUE INDEX `idx_gym_applications_open` ON `gym_applications` (`owner`) WHERE `status` = 'new'",
      ],
    })
    app.save(applications)
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId('gym_applications'))
    } catch {
      /* already gone */
    }
  },
)
