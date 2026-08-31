# enForma panels: gym operators and global admin

Study and design record for the three-role model introduced on 2026-08-26.
The constraint that shapes everything: enForma is local-first with
cryptographically isolated profiles. There is no server. Every design below
is honest about what that allows and what it cannot do.

## Roles

`ProfileMeta.role` in the plaintext registry: `member` (default), `gym`,
`admin`. Since 2026-08-28 roles are not self-service: the gate only creates
members, whoever sets up a fresh device becomes its administrator, and gym
and admin are assigned exclusively from the admin panel. A `gym`-role
profile's `gym` field names the gym it operates — the same field a member
uses to say where they train.

Verifying that a gym is real — and charging it, since publishing is a paid
surface — cannot be enforced by a device-local role. Since phase 5 (shipped
2026-08-28) the server is the authority for synced accounts: `gyms` rows are
created only by the platform superuser, operators are listed on the gym row,
and an operator account carries the gym role onto every device it signs into.
The payment step itself is still manual (the superuser grants after charging);
automating it is future work.

Trust model: whoever holds the device and a profile's passphrase is that
actor. Roles gate navigation and panels, not cryptography. Training data
stays sealed per profile regardless of role; no panel can read another
profile's encrypted store. What roles CAN see is the public directory
(names, gyms, avatars, roles) and the shared message store.

## Message bus (`src/lib/messages.ts`)

A device-level plaintext store, `forma-gym-messages`. Gym content —
events, menus, offers — is broadcast material, not a member secret, so it
does not belong inside any single profile's ciphertext. Personal targeting
metadata (which profile ids a message addresses) is directory-level data,
consistent with names and gyms being public on the device.

```
GymMessage {
  id, gym, authorId, createdAt
  kind: 'announcement' | 'event' | 'menu' | 'offer'
  title, body?            // sanitised HTML; see "The body" below
  images?: [{ url, alt }] // up to 4, uploaded to the sync server
  audience: 'all' | profileId[]
  event?: { date, time?, place? }
  menu?:  { courses: [{ name, dishes[] }] }
  offer?: { discount, validUntil, code }
  readBy: profileId[]
  rsvp:   { [profileId]: 'yes' | 'no' }
  saved:  profileId[]
}
```

Zustand store (`useMessages`) hydrated from localStorage, persisted on every
change, re-hydrated on the `storage` event so a gym tab and a member tab on
the same machine stay live.

### The body, and the pictures

Every template carries a formatted body and up to four photographs — the same
two fields whether it is an offer, a shop item, an event, the daily menu, a
challenge, a collection or an announcement. A gym sells things; one line of
grey text was never going to do it.

The body is HTML, written through a small `contenteditable`. The toolbar *is*
the allowlist made visible, and the list is closed on both sides: paste is
reduced to plain text, so nothing enters except through a button, and a tag
with no button could never appear anyway.

What it can produce: three heading levels (`h4`–`h6`, named Heading /
Subheading / Small heading), paragraphs, quotes, bulleted and numbered lists,
dividers, bold, italic, underline, strikethrough, highlight, superscript,
subscript, and links.

Deliberately absent: `img` and `figure` (pictures are uploaded to the row, not
written into text), `table` (a price table is what the menu and shop templates
already are, and on a phone it is a horizontal scrollbar), `pre`/`code`,
`div`/`span` (no meaning of their own — useful only as attribute carriers), and
`details`/`summary` (the card already decides what to fold on Today). Headings
start at `h4` because the card renders the message title as an `h3`.

`src/lib/rich-text.ts` sanitises with DOMPurify to exactly those tags, forces
`target="_blank"` and `rel="noopener noreferrer nofollow"` on links, and
refuses any scheme but http(s), mailto, tel and `#`.

Sanitising happens **on render, every time** — not once on the way in. A row
can also arrive from the sync server, and the only thing that account
guarantees is that it belongs to an operator. Bodies written before formatting
existed are plain text with blank lines; `bodyHtml()` detects which era a body
is from and converts, so old messages keep their paragraphs. `htmlToPlain()`
is what the Today card's opening line uses, because a tile has no business
rendering markup.

Images are files on the `gym_messages` row, not data URLs: a couple of photos
in localStorage would eat the quota the training history lives in. The client
downscales to 1400px and re-encodes as JPEG before upload, so the server's
`maxSize` is a backstop rather than the working limit. Alt text rides in
`payload.alts`, aligned by upload order, because the operator writes it before
PocketBase has named the files. A gym publishing without a sync account gets
the picker disabled and told why — there is nowhere to put the bytes.

Rendering adapts to how many there are: one photo takes the full measure,
three take a 2fr lead with two stacked beside it, two and four go in a grid.
On Today the picture is inset inside the aurora tile rather than replacing it,
because the aurora is that surface's material and the photograph is the gym's.

### Answers travel (`gym_responses`)

`readBy`, `rsvp` and `saved` are keyed by *profile* id, which is device-local
and meaningless anywhere else. For a synced member each answer is also a row
on the server — one per member per message, upserted, carrying the member's
name — and the gym pulls every row against its own messages, folding them back
in under `srv-<userId>`. That is what makes the reach panel count members
rather than the operator's own clicks; before it existed those tallies were
structural zeroes on any machine but the one that answered.

A dirty set (`forma-response-dirty`) records what was answered here and not yet
sent, so a pull cannot undo a tap made a second ago and a device that never
answered cannot push its emptiness over an answer made elsewhere.

## Interactive templates

Each kind is a structured form in the gym composer and an interactive card
in the member inbox:

- **Announcement** — title + body. Read receipt only.
- **Event** — date, time, place. Members RSVP yes/no in the card; the
  composer shows the running tally.
- **Daily menu** — named courses, each a list of dishes. Rendered as a menu
  card.
- **Offer** — discount text, valid-until date, auto-generated redemption
  code, QR. Members can save it; the gym sees save counts. The QR encodes
  `enforma:offer:<code>:<gym>` so any scanner shows a verifiable string the
  front desk can check against the panel's sent list.

QR generation is client-side via `uqr` (MIT, ~4 kB, no dependencies),
wrapped in `src/ui/QrCode.tsx` as theme-aware SVG.

## Banners

Any message can also ride as a banner: a strip under the top bar shown to
its audience for a configurable window (5 minutes to all day), then gone.
Targeting is the message's own — the whole gym, a group, or one person —
so a banner for Iris never renders for Bram. Dismissal is per-profile and
permanent (`bannerDismissedBy`). Expiry is wall-clock from publish;
`activeBanners()` in `src/lib/messages.ts` is the single source of truth
and is unit-tested. Operators never see their own banners (author
exclusion). The strip lives in the app shell above the route outlet.

## Standing menus

Each gym keeps a permanent kitchen card (`forma-gym-menus` on the device, one
`gym_menus` row per gym on the server) separate from the one-off "Daily menu"
broadcast. Saving pushes it and every member's sync pulls it, which is what
puts the priced card on their Today; until that existed the card lived only in
the operator's own browser and members saw the free public recipe instead. The
gym panel's Menu section edits it in place — sections of items with
descriptions and prices, seedable from `SAMPLE_MENU` — and members browse it
at `/menu` (linked from the inbox header and from menu banners). "Promote as banner"
publishes an announcement whose banner links straight to `/menu`, which is
how the kitchen reaches members who never open the inbox. Admin gym
renames and deletes propagate to menus like they do to messages.

## Notifications

Delivered where a serverless app can deliver them:

1. **In-app**: unread badge in the navigation; inbox marks read on view.
2. **System notifications** (Notification API): opt-in toggle in Settings.
   Fired when the active profile has unread messages — on unlock, and live
   via the `storage` event if a gym publishes from another tab while the
   member is unlocked.

**True remote push** (device closed, server-sent) requires Web Push: VAPID
keys, a subscription store and a delivery server. That is a backend
(Supabase edge functions or similar) and a deliberate departure from
local-first — the same phase-two conversation as account sync. The seam is
ready: `src/lib/notify.ts` isolates permission + display, and the service
worker (vite-plugin-pwa) is where a `push` listener would land. Nothing else
would need to change shape.

## Gym panel (`/gym`, role: gym)

- **Members**: every directory profile whose gym matches, with avatars and
  join dates.
- **Composer**: template picker, structured fields per kind, audience
  selector (everyone or chosen members), live preview, publish.
- **Sent**: reverse-chronological history with read counts, RSVP tallies,
  offer save counts, and delete. An event also lists who is coming by name —
  "going 12" tells a gym how many chairs to put out and nothing about who to
  expect at the door.

## Admin panel (`/admin`, role: admin)

- **Overview**: profiles, gyms, messages counted.
- **Users**: the full directory with role management (member/gym/admin),
  plus the same edit/delete as the Settings device panel.
- **Gyms**: catalogue CRUD. Renaming a gym rewrites the catalogue entry,
  every profile pointing at it and every message it ever sent; deleting
  unassigns members and removes its messages.
- **Movements**: CRUD over the `exercises` collection, picture included.
  The bundled catalogue is generated by `scripts/import-exercises.mjs` and
  frozen — its ids are written into everybody's logged workouts, so nothing
  edits those files by hand. This is the other half: movements the platform
  adds or corrects between releases. `published` gates what members see, so a
  row can wait for its photograph. Ids are prefixed `srv-`, they arrive in the
  Library and the movement picker beside the bundled ones, and
  `src/store/useCatalogue.ts` caches them to localStorage so a lost connection
  does not empty the library. Write is platform-admin only
  (`pb_migrations/1757400000_exercises_admin.js`), and
  `pb_hooks/exercises_admin.pb.js` validates every field again on arrival.
  Withdrawing is separate from `published` and covers **every** catalogue:
  `exercises_hidden` holds ids, and `exerciseLookup` drops them whichever
  file put them there — free-exercise-db, RepDB, wger or a row written here.
  It hides rather than deletes, so `exerciseById` still resolves the id and a
  workout logged before the movement was retired keeps its name; restoring it
  puts it back exactly where it was. Note the plan generator still draws from
  the bundled catalogue directly, so a withdrawn movement can still be
  programmed — the Library and the movement picker are what it covers today.
- **Recipes**: the same shape for the gym's own dishes, `house` provider.

## Navigation by role

Everyone gets Today/Planner/Library/History/Settings plus an Inbox with an
unread badge (desktop rail item; bell in the mobile header). A gym profile
adds "Gym panel"; an admin adds "Admin". Panels guard themselves and
redirect wrong-role visitors home.
