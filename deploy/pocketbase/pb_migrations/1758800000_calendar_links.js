/// <reference path="../pb_data/types.d.ts" />
/**
 * One row per account per calendar it has connected.
 *
 * This is the collection v1 refused to create, and the refusal was written
 * down: "two-way sync would mean our server holding a credential that can read
 * somebody's whole calendar forever, and that is a different product with a
 * different privacy story." It is now that product, deliberately, because a
 * file somebody exports by hand was not the integration that was asked for.
 * What follows is the design that makes the trade defensible rather than the
 * smallest thing that works.
 *
 * **No API rules at all.** Every rule is null, so PocketBase serves this
 * collection to nobody: not the owner, not an admin, not a member with a
 * token. It is reachable only from privileged code in `calendar.pb.js`, which
 * returns a status and never a secret. A collection whose rows can read a
 * person's diary has no business being listable.
 *
 * **The secret is encrypted at rest**, with `CALENDAR_SECRET` from the
 * server's environment, so the database file on its own is not enough. The
 * route refuses to connect anybody when that variable is missing rather than
 * quietly storing a refresh token in the clear.
 *
 * **What is stored is the refresh token and nothing else about the calendar.**
 * No events, no titles, no attendees. Events are fetched when a day is drawn
 * and normalised to busy blocks on the way out; the only copy that persists is
 * the encrypted one on the member's own device, which is where the rest of
 * their day already lives.
 *
 * `cascadeDelete` on the owner: deleting an account takes its calendar links
 * with it, which is the one deletion path that must not leave a live token
 * behind.
 */
migrate(
  (app) => {
    const links = new Collection({
      type: 'base',
      name: 'calendar_links',
      listRule: null,
      viewRule: null,
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        {
          name: 'owner',
          type: 'relation',
          required: true,
          collectionId: '_pb_users_auth_',
          cascadeDelete: true,
          maxSelect: 1,
        },
        /* One value today. A field rather than an assumption, because Apple
           (CalDAV) and Microsoft (Graph) are the same table with a different
           exchange, and the client already asks "which calendar". */
        { name: 'provider', type: 'text', required: true, max: 16 },
        /* The refresh token, sealed. Never returned by any route. */
        { name: 'secret', type: 'text', required: true, max: 4000 },
        /* Which account it is, so a screen can say so. An email address, shown
           back to the person it belongs to and to nobody else. */
        { name: 'account', type: 'text', max: 200 },
        { name: 'last_synced', type: 'date' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE UNIQUE INDEX `idx_calendar_links_owner_provider` ON `calendar_links` (`owner`, `provider`)',
      ],
    })
    app.save(links)
  },
  (app) => {
    app.delete(app.findCollectionByNameOrId('calendar_links'))
  },
)
