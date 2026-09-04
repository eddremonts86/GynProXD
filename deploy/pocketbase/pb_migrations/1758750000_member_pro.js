/// <reference path="../pb_data/types.d.ts" />
/**
 * Whether a member has paid, as a date rather than a state machine.
 *
 * `1757900000_gym_plan.js` said why a gym's plan is a text field somebody sets
 * by hand: "a subscription state machine with no payments behind it is a
 * mechanism pretending to be a fact." The same sentence applies here and
 * decides the shape rather than forbidding the field.
 *
 *   users.pro_until   date, empty for everybody
 *   users.pro_source  text, how they came to have it
 *
 * One date, and the only question ever asked of it is whether it is in the
 * future. There is no `status` enum to fall out of step with a provider's own,
 * no `cancelled` to write and forget to read, and nothing to run on a schedule:
 * an unpaid subscription lapses because time passes. Renewal moves the date
 * forward. Cancellation is the absence of a renewal.
 *
 * `pro_source` exists because there will be more than one way to hold this.
 * Today it is `grant`, set by `scripts/admin/grant-pro.mjs`, which is exactly
 * how a gym gets its plan and for exactly as long as the same excuse holds. A
 * card comes later and writes `stripe`. If a gym ever covers its members, that
 * is `gym`, and it is a third value rather than a second field.
 *
 * Neither field is required and neither has a default, so no existing row is
 * rewritten and no account becomes Pro by having a migration run. Absent reads
 * as unpaid everywhere it is checked, which is the direction to be wrong in.
 *
 * Neither is writable by the account that owns it. `users` update is
 * `id = @request.auth.id` and PocketBase rules are per record, not per field,
 * so the guard is a request hook in `pb_hooks/member_pro.pb.js` rather than a
 * rule here. That hook fires for API traffic and not for a privileged save,
 * which is the property the grant script and, later, the webhook both need.
 */
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('users')
    users.fields.add(new Field({ name: 'pro_until', type: 'date' }))
    users.fields.add(new Field({ name: 'pro_source', type: 'text', max: 16 }))
    app.save(users)
  },
  (app) => {
    const users = app.findCollectionByNameOrId('users')
    users.fields.removeByName('pro_until')
    users.fields.removeByName('pro_source')
    app.save(users)
  },
)
