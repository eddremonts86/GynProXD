/// <reference path="../pb_data/types.d.ts" />
/**
 * What it takes for Google to tell us a calendar changed, instead of waiting to
 * be asked.
 *
 * Three of these columns are the channel: Google will only push to a channel
 * that was opened by name, they expire on a timer it chooses, and closing one
 * needs an id it hands back rather than the one we sent. The fourth is the
 * whole point — `changed_at` is the news, and the day re-reads because of it.
 *
 * **None of it is a cursor, and that is a decision rather than an omission.**
 * `syncToken` cannot be combined with `timeMin`, `timeMax` or `orderBy`, which
 * are the three parameters the three-week read is made of, and there is nowhere
 * here to apply a delta to: this server stores no events by design, so the only
 * copy that could be patched lives on the member's device. `updatedMin` would
 * fit the window, but the device replaces its whole mirror for a provider on
 * every read and its blocks carry no event ids, so a delta would mean keying
 * the day by Google's ids and merging. That is a change to the day model to
 * save bandwidth on a read that is already capped at 250 events. It stays
 * unwritten until a read is expensive enough to be worth the merge.
 *
 * `1758800000_calendar_links.js` holds the rest of the table and its reasoning,
 * including why every API rule on it is null — which is also why none of these
 * columns needs to be a secret: no client can read this collection at all.
 */
migrate(
  (app) => {
    const links = app.findCollectionByNameOrId('calendar_links')
    /* Ours, and the name Google pushes to. */
    links.fields.add(new Field({ name: 'channel', type: 'text', max: 64 }))
    /* Google's, and the only thing that can close the channel again. */
    links.fields.add(new Field({ name: 'resource', type: 'text', max: 200 }))
    /* When Google says it stops pushing. The renewal cron reads this. */
    links.fields.add(new Field({ name: 'channel_expires', type: 'date' }))
    /* Set when Google says the calendar changed, cleared by the read that
       answers it. A date rather than a flag so a stale one can be reasoned
       about, and so `/status` can say when rather than merely whether. */
    links.fields.add(new Field({ name: 'changed_at', type: 'date' }))
    app.save(links)
  },
  (app) => {
    const links = app.findCollectionByNameOrId('calendar_links')
    for (const name of ['channel', 'resource', 'channel_expires', 'changed_at']) {
      links.fields.removeByName(name)
    }
    app.save(links)
  },
)
