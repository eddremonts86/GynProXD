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

1. **In-app**: unread badge in the navigation; a message is marked read when
   it is opened, not when the inbox is. See "The inbox" below — the badge used
   to clear itself as you walked past.
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
  puts it back exactly where it was.

  It reaches the programme too. `lib/withdrawn.ts` is a device-wide registry
  the store writes and `plan-generator.allowedPool` reads — the one chokepoint
  the deterministic generator, the coach's grounding list and the validator
  that accepts the coach's answer all run through, so a withdrawn movement
  stops being programmed in one place rather than three that would drift.
  Primed from the localStorage cache at construction, so a cold start with no
  signal generates the same programme an online one would.
- **Recipes**: the same shape for the gym's own dishes, `house` provider.

## Navigation by role

Everyone gets Today/Planner/Library/History/Settings plus an Inbox with an
unread badge (desktop rail item; bell in the mobile header). A gym profile
adds "Gym panel"; an admin adds "Admin". Panels guard themselves and
redirect wrong-role visitors home.

## The house gym

Until this existed, a member no gym had claimed received **nothing**. Not less
— nothing: the read rule matched `gym` against `@request.auth.gym`, and an
account with no gym never matched a row, so the inbox, the banners, the push
notifications and the events panel were all built, shipped and silent for them.
They are the majority of new accounts.

So the platform gets to speak, through one row in `gyms` marked `kind: 'house'`
and displayed as **enForma**. It is identified by that field and never by its
name — which is what makes it safe to rename, and makes a device-local gym that
happens to share the name harmless.

What it deliberately is **not** is a membership. No `users.gym` points at it.
"Has a gym" stays `gym != ''` everywhere in the app, nothing was rewritten, and
nobody acquired a membership they did not ask for. Belonging to nothing is a
real state and it is modelled as one; `gym_join_requests` refuses the house,
because a request to join it would be both meaningless and, if approved, would
make every "do they have a gym?" check in the app start lying.

### Two audiences that must not blur

`gym_messages.scope` says who a message is for.

| scope | who receives it | who may send it |
| --- | --- | --- |
| `members` (or absent) | the gym's own members, matched by name | any gym operator |
| `unaffiliated` | accounts with no gym, and who run none | platform admins, as the house |
| `everyone` | every account | platform admins, as the house |

Absent reads as `members`, so every row published before this reaches exactly
who it reached before.

Deleting follows the same authority, and did not at first. `1757600000` moved
the right to *publish* from a gym's `operators` list to `platform_admins` and
left `deleteRule` asking `gym.operators.id ?= @request.auth.id`. The house's
operators list is empty on purpose, so for a house message the answer was always
no — for everybody, admins included. **The platform could publish and could
never unpublish.** `1757700000_house_can_delete.js` adds the matching arm.

Found by using it: a release check published a message to production and the
delete that should have followed came back **404**, which is what PocketBase
returns when a rule refuses rather than when a row is missing. It reads as
"already gone" for a moment. The lesson is smaller than the bug — who may write
and who may unwrite are one decision, and only half of it was made.

The gating lives in the read rule itself
(`pb_migrations/1757600000_house_gym.js`), not only in the create hook: the
wider arms require `gym.kind = 'house'`, so a gym that somehow wrote
`scope: 'everyone'` onto its own row still reaches nobody. A rule that works
only because a hook ran stops working the day somebody edits the hook.

An operator counts as affiliated even though their own `users.gym` is empty —
they run a gym, they are not a member of it. Without that clause the server
would have handed them the "nobody has claimed these people" audience while the
client's own filter excluded them, which is a disagreement, not a feature.

### Why the composer asks first

The danger is not technical. It is somebody typing an offer while thinking
about the other group. A radio pair above a composer is one control with two
outcomes and the dangerous one a mis-click away, so the choice is a door
instead: `/admin` → Broadcast asks who before there is anything to lose, the
audience stays on screen the whole time, and going wider is a deliberate trip
back.

Commercial templates (`offer`, `product`) aimed at `everyone` stop for a
confirmation that states the number rather than asking whether you are sure —
"it goes to 10 people, 5 of them train at a gym" — and offers the message you
probably meant as the **primary** action. Narrowing there re-derives the
audience from the scope being sent, never from the memoised list of the scope
just abandoned; getting that wrong delivered to five and reported ten.

### How the boundary is checked

Two layers, because neither covers the other.

**`scripts/audit/house-gym-boundary.mjs`** boots a throwaway PocketBase from
these migrations and hooks and asks 17 questions, every one from the receiving
side — the sender's intent is not evidence. Run it after touching any of this.
It covers who may publish, who may delete, who actually receives, and that
nobody applies to belong to nothing. It is load-bearing rather than decorative:
remove the read rule's `@request.auth.gym = ''` guard and two checks fail;
remove `1757700000` and "an admin can delete the house's own" fails.

**Production, once, by hand**, because a sandbox proves nothing about the
migration that ran on the real database. Both accounts in
`enforma-production-accounts.env` have no gym, so the negative half needed a
member of one. Rather than touch a real gym, the check builds a disposable gym
with the PocketBase superuser, gives it a join code, signs one account up and
walks it through `join-with-code` — the same path a real member walks, not a
direct write to `users.gym`, which the membership hook refuses anyway:

```
the house publishes to the unaffiliated   200
the account with no gym receives it       ['CHECK unaffiliated only']
the gym member does NOT                   []

the house publishes to everyone           200
the account with no gym now has both      ['CHECK everyone', 'CHECK unaffiliated only']
the gym member has only that one          ['CHECK everyone']
```

The second block matters as much as the first: it shows the gym member is not
simply blind to everything the house sends. They receive what is addressed to
everyone, and only that.

Everything it creates is removed in a `finally` — two messages, the account, the
code and the gym, five `204`s — so production ends where it started: two gyms,
no messages, no join requests.

Two things worth knowing before repeating it. Getting the superuser pair is not
a file lookup: `PB_SUPERUSER_EMAIL` and `PB_SUPERUSER_PASSWORD` live only as
environment variables on the Coolify resource, readable through
`GET /api/v1/applications/<uuid>/envs` as `real_value`. And an account created
straight through the API needs `authPassOf(email, password)` as its PocketBase
password, not the password itself — passing the raw one makes an account that
exists and cannot be logged into, which is how the first attempt left a stray
user behind.

### Rolling it back

Rehearsed against a database already holding two gyms, five messages and their
members, because that is what production is and an empty sandbox proves nothing
about a backfill. Reverting takes `kind` and `scope` off, deletes the house row,
restores the read rule to the exact string it had, and leaves both gyms holding
all five of their messages — only the house's own cascade away with it.

The catch: `pocketbase serve` applies pending migrations on start. Reverting
while the migration file is still on disk reverts it and then the next restart
puts it straight back. A real rollback is **deploy the previous commit first,
then `migrate down 1`**.

## The inbox

A list you scan and a message you read, which is to say an email client.

It was a column of full cards, and that worked while a gym only published
one-line announcements. It stopped working the moment the same column had to
hold a menu with four courses and three photographs, an offer with a QR code
and a closure notice — each sizing itself, so finding anything meant scrolling
past everything.

- **Rows are a fixed height** whatever the message holds:
  sender, date, title, kind, and one line of preview. `previewOf` supplies that
  line — from the body when there is one, and otherwise from what the template
  is actually about (the discount, the price, the date, what the kitchen is
  cooking), because most templates are structured rather than prose and every
  offer would otherwise show an empty row beside a full one.
- **`htmlToLine`, not `htmlToPlain`**, for that preview. The latter sanitises
  and parses with a `DOMParser`, which is right for a card's opening paragraph
  and wrong for a list: it would run per message per render and needs a
  document at all. Cheap stripping is safe here because the result is set as
  text, never as HTML.
- **Read means opened.** The old screen marked every message read on mount, so
  read/unread carried no information — the badge cleared itself as you walked
  past. "Mark unread" exists for the correction, and deliberately does not
  retract the read receipt the gym already has: it changes what this device
  shows, not what happened.
- **Selection lives in the URL** (`/inbox?m=<id>`). The back button closes a
  message instead of leaving the inbox, a reload lands where you were, and a
  notification can deep-link to the message it is about.
- **Nothing is auto-selected.** Opening the newest message on arrival would
  mark it read before anybody looked at it, which is the behaviour this screen
  was rebuilt to stop.
- **Remove is per profile and local** (`deletedBy`). A member cannot delete the
  gym's row — the server gives `delete` to that gym's operators only, and it
  should, because one member clearing their inbox must not erase an event forty
  others are still reading. So it hides it for one profile, says so in those
  words, and offers an undo. `merge` preserves `deletedBy` or the next pull
  resurrects everything.
- The removal check lives in `isAddressedTo`, not in `inboxFor`, so the list,
  the badge, the banner and the notification all agree. Four callers asking the
  same question separately is four places to forget one.

Layout is a list column and a reading pane above `md`, one or the other below
it — a reading pane 40 characters wide is not a reading pane. Every grid track
is `minmax(0, …)`: a column defaults to `auto`, which sizes to max-content, and
the single mobile column grew to 4708px to fit a preview line that could then
never truncate, because truncation needs a bound and the bound was the thing
being computed.

Arrow keys (and `j`/`k`) move through the list, Backspace removes the open
message. Moving with the arrows opens each message as it goes, and therefore
marks it read — the same trade Apple Mail makes, and the reason "Mark unread"
is one click away.

## The two front doors

`/` sells a free product to somebody who wants to train. `/for-gyms` sells a
paid one to the business that wants to reach them, and they are not the same
argument turned around: the gym is buying access to attention that the member's
own product earned. So the gym page spends its first section on why a member
keeps the app at all, and only then on what the gym can put in front of them. A
reach figure is worth nothing if the app is deleted in a fortnight.

Both doors carry a link to the other, and both live outside the app shell:
`app-shell` returns the gym landing before it decides anything else, locked or
not. Locked, because a gym owner arriving has no profile on the device — which
is the whole point of the page. Unlocked, because rendering it inside the shell
gave a landing page the app's own header above its header and the app's tab bar
under its footer.

`landing-kit.tsx` holds the measure, the heading scale, the rail and the narrow
bar. Only the shape: every word stays in the page that says it. Two copies would
have looked identical the day they were written and drifted by the second
change, and the drift would show — the point is that the two pages are the same
building seen from different doors.

### What the gym page may claim

Two hard boundaries, and they shape the whole pitch.

**Training data is unreadable, to the gym and to us.** Sets, weights, history
and measurements are encrypted with a key derived from the member's passphrase;
the server holds rows it cannot open. So no feature that would need to read them
can ever be priced here. The page sells this as a limit rather than hiding it,
because a gym that has been offered somebody's training data before knows what
it is worth that we cannot.

**Counts are counted.** `TEMPLATE_COUNT` comes off `TEMPLATE_LABELS` and the
reach window off `REACH_WINDOW_DAYS`. The first draft had a comment reading
"counted, never typed" directly above a hardcoded `7`, which is the same lie
with a comment on it.

### The plans

Base at €200, Plus at €300, per gym per month. The split is deliberately not
"talking vs selling" — a €200 gym that cannot run an offer would feel gouged,
and the offer is the best hook we have. Base is **everything the gym says**;
Plus adds **surface in the member's day**: the kitchen and signed programmes
today.

Anything not built carries a `Coming` tag, no date, and the panel says in words
what Plus buys today and that the marked items do not change what you pay. There is no Stripe: the page says we invoice, because a checkout that
does not exist is the one thing a pricing page must not imply.

### Applying

`gyms.createRule` is null and stays null — a gym is a paying account with a
member roster, not something a form conjures, and the provisioning script is
unchanged. So the call to action collects a `gym_applications` row and nothing
else happens on its own. A row grants no gym, no operator and no reach; the
audit checks that.

`owner` is required, which is what enforces "a gym is a sync account": applying
needs an account, so there is no anonymous write to spam, and the account is the
one we will need anyway since it becomes the operator. The unique partial index
allows one open application per account — a double-click is not two rows for
somebody to reconcile, and re-applying after a decline is a new row because the
old one is no longer `new`.

Unlocking a profile from the apply panel tells the session store but
deliberately does not navigate. The member landing's handler calls `landFor`,
and on a fresh device the first profile becomes the device admin — so reusing it
would have sent an applicant straight to `/admin`, off the form they were
filling in.

`/admin` → Applications reads the queue, because a form whose rows nobody can
see is a form that throws applications away. The only control there is the
status: the panel records what a person did, it does not do it.

## Programmes signed by your gym

Plus. `PLUS_FEATURES` calls it `programmes`; the composer offers the template
only when `planAllows(plan, 'programmes')`, and the landing drops its `Coming`
tag from the same set, so the page cannot advertise it while the gate refuses it.

A gym designs a programme the way a member does — the planner, the intake, the
blocks — so there was no second designer to build. What this adds is signing one
and handing it over. `/gym` → Compose → Programme lists the operator's own
`generatedPlans`; publishing sends `kind: 'programme'` with a `programme`
payload, and the member's inbox card offers **Put it on my calendar**.

### What travels, and what must not

The obvious implementation publishes the operator's `GeneratedPlan`, and it is a
data leak. A `GeneratedPlan` carries its `input`: age, sex, weight, target
weight, height, and `limitations` — the field an injury is written in.
Publishing one would broadcast the operator's body and their bad knee to every
member of the gym. This app tells members their training never leaves their
device; the first feature that quietly published a person's training would make
that a lie told to the people who trusted it most.

So what is published is the **structure** plus the shape it was designed around,
which is training information rather than personal information:

| Travels | Stays on the operator's device |
| --- | --- |
| blocks of days, movement ids, per-day notes | age, sex, weight, target weight, height |
| days a week, minutes a session, equipment, level | goal, limitations, avoid, constraints |
| the duration, the gym's name for it, the gym's own blurb | training days, effort, milestones, every date |
| | the coach's notes on the designer's own plan |

`programmeFromPlan` (`src/lib/gym-programme.ts`) is the only place that decides,
and it reads five fields off `plan.input` by name rather than spreading it — a
spread would have carried the next field somebody adds to the intake. The blocks
are recovered from `plan.weeks` by `blockIndex`, one week per block, because
`GeneratedPlan` keeps its days on the calendar and its blocks as metadata.

`PERSONAL_INPUT_KEYS` names the other half of that line so a test can walk it,
and so adding a field to the intake makes somebody decide which side it falls on.

**`goal` does not travel either**, and it took a screenshot to see why. It was
published as a training fact and rendered as a tag, so a member who came to build
muscle was shown "Lose fat" — one person's aim for their own body, presented as a
property of the programme. No test caught it because nothing was leaking by the
rules as written; the rule was wrong. The gym says what a programme is for in
`blurb`, in its own words.

**`coachNotes` does not travel, and that was not obvious.** The field carries
nothing personal by its shape, so both the allowlist and the first version of the
unit test passed it — while the prose inside it, written to the designer about
the plan built for *their* body, said "ACL precautions are strictly followed".
The audit caught it on a member's screen. What members read instead is `blurb`:
the message body, which the operator wrote to them on purpose. A field being
harmless is not the same as its contents being harmless, and only a check that
reads rendered output can tell the difference.

### The member's own copy

`adoptProgramme` hands the structure to the same `assemblePlan` the member's own
designer uses, with the member's `input`, and puts the gym's `blurb` where a
plan's coach notes go — so the member's plan page says what their gym says. Their dates, their length, their
milestones. Two members adopting the same programme get two different calendars,
and the gym supplied the training and nothing else — which is also the better
product: the gym is the coach, not the calendar.

The member's numbers come from their newest plan's `input`, because there is no
separate store of somebody's intake. Somebody who has never used the planner has
told us nothing, so the card says so and the button sends them to the planner
rather than dating a programme from defaults.

The copy's id is `gen-adopted-<message id>`, derived rather than random: the
inbox asks "is it already on my calendar" by looking for it, so pressing the
button twice cannot leave somebody with two copies of the same twelve weeks. The
gym is told `adopted N` and nothing else — not which members, not what they did
with it.

`programmeMismatch` warns a member whose equipment does not cover the movements,
naming what it was written for. `assemblePlan` does not filter, so this has to be
said on the card rather than fixed underneath: silently handing barbell work to
somebody with no barbell is worse than telling them.

### How it is checked

`src/lib/gym-programme.spec.ts` walks `PERSONAL_INPUT_KEYS` over
`JSON.stringify(programmeFromPlan(...))` and asserts neither the keys nor the
values reach it — walked rather than spot-checked, so a new intake field cannot
slip through.

`node scripts/audit/gym-programme-boundary.mjs` runs the whole thing against a
real PocketBase booted from this repo's migrations: a Plus gym, an operator whose
own plan says 47, 91kg, heading for 78 and a reconstructed ACL, the app's own
composer. It then reads the row the server stored and asks whether any of that is
in it, and reads the member's screen and their adopted copy and asks again. The
sender's intention is not evidence.

The largest payload this can produce was measured before it shipped: an annual
six-day programme is about 21KB against `gym_messages.payload`'s 100KB cap.
