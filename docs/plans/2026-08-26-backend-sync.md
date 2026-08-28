# Backend, sync and push: what it takes to leave the browser

Status: study (no code yet)
Date: 2026-08-26

Decisions locked with Edd 2026-08-26, after the study was first drafted:
one multi-tenant server (not an instance per gym); email + password login
(so SMTP is required infrastructure); the E2E key stays derived from the
passphrase, re-entered once per device, with a one-time recovery code at
signup; and account-less local profiles remain a first-class option rather
than a migration path. The component diagram of all this is
`sync-architecture.html` at the repo root.

## Why this exists

enForma is local-first with no server. That was the right v1 call and it is
now the ceiling: no cross-device sync, no passphrase recovery, a gym panel
that can only see members who share one physical device, and no real push.
This studies what changes, what it costs, and what is lost.

## Current state (verified in code, 2026-08-26)

**Storage.** Everything is `localStorage`, split in two trust levels:

| Key | Contents | Encrypted |
|---|---|---|
| `forma-data-<profileId>` | the whole `GymSnapshot` | yes, AES-GCM |
| `forma-profiles` | registry: names, gyms, roles, KDF salts | no |
| `forma-gym-messages` | the gym bus (events, menus, offers, challenges, collections) | no |
| `forma-gym-menus` | standing gym menus | no |
| `forma-recipes` | daily dish + suggestion cache | no |
| `forma-session-key` / `-profile` | the unlocked key, `sessionStorage` | raw key |
| `forma-notify`, `forma-notify-training`, `forma-retest-nudged`, `forma-coach`, `forma-planner-plan` | device prefs | no |

**Crypto.** Passphrase → PBKDF2-SHA256, 310k iterations → AES-GCM-256
(`crypto.ts`). The key is never stored at rest; it lives in `sessionStorage`
while unlocked so a mid-workout refresh does not re-prompt.

**The write path.** `persistNow()` (`profiles.ts:223`) encrypts the *entire*
`GymSnapshot` and writes it to one key. Debounced 400 ms, flushed on
`visibilitychange` and `pagehide`.

**Service worker.** Active — but `generateSW` (Workbox) doing precache +
a CacheFirst rule for `/repdb/`. There is **no** custom SW file, **no**
`push` listener, **no** `notificationclick`, **no** `pushManager`, **no**
VAPID. No dedicated Web Workers anywhere.

**Notifications today** are the local Notification API firing only while the
app is open (`notify.ts`), on two prefs (`gym`, `training`).

## Data volume: the number that shapes the design

- One logged workout: **~800 bytes**.
- Three sessions a week for two years: **~240 KB**.
- One 12-week generated programme: **~26 KB**.

A user's entire history fits in a single request. This rules out the heavy
sync engines — ElectricSQL, PowerSync and Zero exist to stream a large
Postgres into local SQLite, and none of that machinery is earning its
complexity here. The right shape is per-entity rows with a logical clock and
a plain pull/push merge.

## The central problem: the snapshot is one blob

`persistNow()` serialises the whole snapshot as a unit. Sync that naively and
last-write-wins destroys data on the second device: train on the phone, open
the laptop holding a stale snapshot, it saves, the phone's session is gone.

The fix is granularity, and the data model is unusually friendly to it:

- **Append-only, immutable by id** — `workouts`, `bodyweight`. A union by id
  merges cleanly; there is no real conflict to resolve.
- **Mutable, low-contention** — `plans`, `customExercises`, `challenges`,
  `profileDetails`, `fitnessTest`. Per-record `updatedAt` + last-write-wins
  is honest and enough; two devices rarely edit one plan in the same minute.
- **Device-local, must NOT sync** — `activeWorkout` (a session belongs to the
  phone in your hand), and every `forma-*` device pref.

So: give every record an `id` and an `updatedAt`, sync record-by-record, and
delete via tombstones. No CRDT needed for this shape.

## The real fork: who can read the training data

This is a product decision, not a technical one, and it decides everything
downstream.

**Option A — keep E2E.** The server stores opaque ciphertext per record.
- Keeps: nobody but the member reads their training, the current promise.
- Costs: passphrase recovery stays **impossible** (a lost passphrase still
  means a lost account); the gym panel can never show real training data;
  no server-side analytics, search or aggregates; the daily-dish and coach
  calls cannot move server-side per user.
- Note the encryption key must be decoupled from the login. Today passphrase
  = key. With accounts you need identity (email/passkey) *plus* a separate
  key, wrapped so new devices can unwrap it — the standard pattern is a
  recovery code shown once at signup.

**Option B — server-readable.** Classic accounts, rows the server can read.
- Gains: password reset, gym dashboards with real adherence data, server-side
  aggregates, cheaper everything.
- Loses: the "your training is sealed" property that PANELS.md and the lock
  screen currently promise. That copy would have to change, honestly.

**Decided: A for training data, B for the public layer.** That split
already exists locally — encrypted snapshot vs plaintext directory and bus —
so it is the smallest conceptual move. The gym bus *must* be server-readable
anyway: one gym writes, many members read, on different devices. It cannot be
encrypted with any member's key.

## What the backend must actually do

1. **Identity** — accounts, sessions, device list, revocation.
2. **Per-record sync** for the encrypted training store (ciphertext blobs
   keyed by record id, with `updatedAt` and tombstones).
3. **The gym bus, multi-tenant** — gyms, membership, messages addressed to
   all or to specific members. Read-your-gym authorisation. This is the part
   with genuine access control.
4. **Push** — VAPID key pair, one subscription row per device, a send path.
5. **Shared fetches** the client currently duplicates per device: the daily
   dish, Spoonacular queries, MiniMax coach calls. Moving these server-side
   also gets the API keys out of the dev proxy and fixes the per-device
   budget burn documented in the recipes plan.

## Stack options

Given Coolify + Hetzner already in the toolchain, self-hosting is the default
assumption, not a fallback.

| Option | Fit | Against |
|---|---|---|
| **Supabase** (self-hosted on Coolify) | Postgres + auth + RLS + realtime + edge functions covers all five needs; RLS maps cleanly to "members read their gym"; Triplit's team joined Supabase in Oct 2025 so local-first is on their roadmap | Heaviest to self-host (many containers); RLS is easy to get subtly wrong |
| **PocketBase** | One Go binary, SQLite, auth + realtime + rules built in; matches the data volume almost exactly; trivial on Coolify | Single-node by design; smaller ecosystem; scaling story is "get a bigger box" |
| **Custom Hono/Nitro + Postgres** | Nothing unused; the sync endpoint is genuinely small at this data size | Auth, sessions, push and rate limiting all become ours to write and keep secure |

**Recommendation: PocketBase first.** The dataset is ~240 KB per user, the
sync contract is one pull and one push endpoint, and it is one binary next to
the existing Coolify apps. Supabase is the answer if gym analytics grow into
real reporting. Explicitly *not* recommended: a full sync engine, which would
be more moving parts than the whole current app.

## Push notifications, specifically

Push is technically independent of sync and cheaper to build — but it is
scheduled last anyway, because until the gym bus is server-side there is
almost nothing to notify.

Required changes:
1. **Switch `generateSW` → `injectManifest`** in `vite.config.ts` and add a
   real `src/sw.ts`. This is a strategy change: today there is no file to put
   a listener in.
2. `push` and `notificationclick` handlers (the latter is what makes a
   notification deep-link into `/inbox` or `/challenges` — impossible today).
3. VAPID keys server-side; `pushManager.subscribe()` client-side; a
   subscription row per device with cleanup on `410 Gone`.
4. `notify.ts` keeps its two-channel preference model as-is; it grows a
   subscribe/unsubscribe path next to the permission logic.

**iOS caveat, verified:** Web Push works on iOS 16.4+ **only for PWAs added
to the Home Screen**, never in a Safari tab. Apple did briefly announce
removing Home Screen web apps in the EU under the DMA and **reversed that in
March 2024** — so this works in Denmark. Some 2026 blog posts still repeat
the withdrawn version; they are wrong. The onboarding will need an explicit
"add to Home Screen" step for iOS members, or push silently never arrives.

## Phases

Order corrected after drawing the flow: push moved from second to last.
Before the gym bus lives on the server there is almost nothing to notify —
building push earlier is fitting a doorbell nobody can ring.

**Phase 1 — record-shaped local store (no server).** Give every entity an
`id` and `updatedAt`; replace the monolithic `persistNow()` with per-record
writes; add tombstones. Ships alone as a refactor with no visible change, and
it is the prerequisite that makes everything after it safe. The only phase
that can start today: it depends on no pending decision.

**Phase 2 — PocketBase on Coolify.** One Go binary with SQLite, auth and
access rules, next to the existing apps. SMTP for account verification and
password reset lands here too.

**Phase 3 — accounts and identity.** Signup/login with email and password,
device list, one-time recovery code shown at signup. Local-only profiles keep
working; an account is opt-in and migration is a one-time upload of the
existing snapshot.

**Phase 4 — training sync.** Pull/push of encrypted records against the
phase-1 shape. Offline queue, conflict rules per the table above,
`activeWorkout` explicitly excluded.

**Phase 5 — the gym bus server-side.** Gyms, membership, addressed messages,
access rules. This is where the roles stop being device-scoped and enForma
becomes a real multi-user product.

**Phase 6 — push.** `injectManifest` + a real `src/sw.ts` + VAPID + one
subscription per device, plus the iOS "add to Home Screen" prompt without
which push silently never arrives. Last because phase 5 is what gives it
something worth delivering.

**Phase 7 — move shared fetches server-side.** Daily dish, Spoonacular,
MiniMax. Keys leave the client; one fetch serves every member.

## Risks and honest costs

- **The promise on the lock screen changes.** "Local only. No cloud." stops
  being true the moment an account exists. The copy must change with it, and
  local-only profiles should remain a real supported choice, not a legacy path.
- **Passphrase recovery is still impossible under option A.** Accounts fix
  *login* recovery, not *decryption* recovery. Only the one-time recovery
  code does, and only if the member kept it.
- **This is the first time enForma holds other people's data.** GDPR applies
  in earnest: export, deletion, a data processor agreement with the gym,
  retention. Not hard, but it is real work that no phase above includes.
- **Cost.** A Hetzner CX22 plus Coolify handles this data volume for years.
  Push is free. The real cost is maintenance: backups, migrations, uptime.
- **Phase 1 is not optional.** Syncing the current blob would lose data on
  day one. Any plan that skips straight to a server is wrong.
