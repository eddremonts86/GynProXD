# enForma panels: gym operators and global admin

Study and design record for the three-role model introduced on 2026-08-26.
The constraint that shapes everything: enForma is local-first with
cryptographically isolated profiles. There is no server. Every design below
is honest about what that allows and what it cannot do.

## Roles

`ProfileMeta.role` in the plaintext registry: `member` (default), `gym`,
`admin`. Roles are picked at profile creation and changed only from the
admin panel. A `gym`-role profile's `gym` field names the gym it operates —
the same field a member uses to say where they train.

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
  title, body?
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
  offer save counts, and delete.

## Admin panel (`/admin`, role: admin)

- **Overview**: profiles, gyms, messages counted.
- **Users**: the full directory with role management (member/gym/admin),
  plus the same edit/delete as the Settings device panel.
- **Gyms**: catalogue CRUD. Renaming a gym rewrites the catalogue entry,
  every profile pointing at it and every message it ever sent; deleting
  unassigns members and removes its messages.

## Navigation by role

Everyone gets Today/Planner/Library/History/Settings plus an Inbox with an
unread badge (desktop rail item; bell in the mobile header). A gym profile
adds "Gym panel"; an admin adds "Admin". Panels guard themselves and
redirect wrong-role visitors home.
