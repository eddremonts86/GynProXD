/// <reference path="../pb_data/types.d.ts" />
/**
 * One more column on `calendar_links`, for the only provider that makes you
 * find the calendars yourself.
 *
 * Google's API has a fixed address: `/calendars/primary/events`, always. CalDAV
 * does not — the path to somebody's calendar home is discovered with two
 * `PROPFIND`s and looks like `/1234567890/calendars/`. Storing it at connect
 * time turns every later read from four requests into two.
 *
 * It is a path and not a secret, so it is not sealed. It is also not a cursor:
 * nothing here syncs incrementally, and the whole three-week window is re-read
 * every time. `1758800000_calendar_links.js` is where the rest of the table and
 * its reasoning live, including why every API rule on it is null.
 */
migrate(
  (app) => {
    const links = app.findCollectionByNameOrId('calendar_links')
    links.fields.add(new Field({ name: 'home', type: 'text', max: 500 }))
    app.save(links)
  },
  (app) => {
    const links = app.findCollectionByNameOrId('calendar_links')
    links.fields.removeByName('home')
    app.save(links)
  },
)
