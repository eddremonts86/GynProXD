# enForma sync server

PocketBase 0.40.1: one binary, SQLite inside. `pb_migrations/` creates the
schema on first boot — encrypted training rows, per-account key material,
gyms and the gym message bus — and `pb_hooks/` enforces that only a gym's
operators can publish to it.

## Coolify

Point a compose service at this directory (`docker-compose.yml`). First boot:

1. Open `/_/` on the service URL and create the superuser.
2. Settings → Mail: set SMTP so the password-reset email sends, and replace
   the users collection's reset template body with one that shows `{TOKEN}`
   as plain text — the app's "Forgot your password?" asks the member to paste
   it. The stock template links to PocketBase's own reset UI, which would
   bypass the app's key re-wrap and must not be used.
3. Gyms are yours to grant: once a gym is verified (and has paid), run

   ```bash
   PB_SU_EMAIL=… PB_SU_PASSWORD=… node scripts/admin/grant-gym.mjs \
     --server https://<sync-domain> --gym "Iron House" --operators coach@example.com
   ```

   (idempotent; the operator must have signed up in the app first). Their next
   sync carries the gym role onto every device they sign into.
4. SMTP: Resend works on port 587 with STARTTLS (Hetzner blocks outbound 465),
   username `resend`, password = the API key. The sender address must belong
   to a domain verified in Resend.

Members never see this server: the app proxies `/pb` on its own origin
(`SYNC_PROXY_TARGET` / `SYNC_UPSTREAM_HOST` env vars on the app service).

## The default accounts, for testing

Every app in this fleet seeds an admin and an ordinary member from
`DEFAULT_ADMIN_*` / `DEFAULT_USER_*` so there is always something to sign in as.
Here that is:

```bash
pnpm seed:accounts --server http://127.0.0.1:8090
```

Idempotent, and it refuses any server that is not a local address unless you
pass `--force` — these are default credentials plus a platform-admin grant, and
putting that pair on a reachable host hands the admin account to anyone who can
read a repository.

**An account is half an identity here, and the half a script can reach.** The
other half is the local profile, whose key is derived from a passphrase inside
the browser and written to `localStorage`; nothing outside that browser can make
one. So the seeded admin is not "log in and you are admin" the way it is in the
apps backed by Postgres. It is:

1. create a local profile in the app — a name and a passphrase
2. Sign in to sync with `DEFAULT_ADMIN_EMAIL` / `DEFAULT_ADMIN_PASSWORD`
3. the next sync reads `platform_admins` and adopts `role: 'admin'`
   (`syncGymBus` in `src/lib/sync.ts`)

**The password on the wire is not the password.** Every sign-in sends
`authPassOf(email, password)` — PBKDF2-SHA256, 310k iterations, salted by the
address — because that same password also unwraps the account's data key and the
server must never be able to do the second job. An account created with the raw
password therefore exists, shows up in the superuser panel, takes a platform
admin grant, and refuses every sign-in from the app with nothing to explain why.
The seed imports the app's own `authPassOf` rather than restating it, which is
the only version of this that stays true when the derivation changes.

Existing accounts are left alone rather than having their passwords reset: a
password here wraps the data key, so rewriting one from outside the app strands
every encrypted row behind a key nobody holds.

Environment for the compose (set as Coolify env vars on this service):

| var | feeds | purpose |
|---|---|---|
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | both | Web Push identity; the public key is served by `/api/enforma/capabilities` |
| `PB_SUPERUSER_EMAIL` / `PB_SUPERUSER_PASSWORD` | push | the sender reads subscriptions and the bus privileged |
| `MINIMAX_API_KEY` (+ optional `MINIMAX_BASE_URL`) | pocketbase | the AI coach route, auth-gated |
| `FATSECRET_CLIENT_ID` / `FATSECRET_CLIENT_SECRET` | pocketbase | tops up the recipe catalogue, auth-gated. FatSecret only issues tokens to whitelisted IPs: add this host's egress IP in their console |

Generate VAPID keys once (`npx web-push generate-vapid-keys` or any P-256
tool) and never rotate them casually: rotating invalidates every existing
subscription.

## Seeding the recipe catalogue

The recipes are data, not code: a fresh server starts with an empty catalogue,
and the app falls back to its bundled sample dishes until this is run. Import
is a two-step, one-time job from a developer machine.

```bash
node scripts/import/myplate-crawl.mjs          # ~2-3 h, resumable, writes scripts/import/out/
PB_URL=https://<sync-domain> PB_SUPERUSER_EMAIL=… PB_SUPERUSER_PASSWORD=… \
  node scripts/import/myplate-seed.mjs         # idempotent: re-running updates, never duplicates
```

The crawl pulls the retired USDA MyPlate collection from the Internet Archive
(public domain, see ATTRIBUTION.md); the seed uploads each recipe with its
photo, so expect roughly a gigabyte over the wire and run it from a machine
with a decent uplink. Both are safe to re-run.

Gym-written recipes need no import: a platform admin adds them in the app under
Admin -> Recipes, and they are stored with `provider: house`.

## Local development

```bash
mkdir -p deploy/pocketbase/.local && cd deploy/pocketbase/.local
curl -sL -o pb.zip "https://github.com/pocketbase/pocketbase/releases/download/v0.40.1/pocketbase_0.40.1_darwin_arm64.zip" # (pick your OS/arch asset)
unzip -oq pb.zip
./pocketbase serve --http=127.0.0.1:8090 --dir=./pb_data --migrationsDir=../pb_migrations --hooksDir=../pb_hooks
```

`pnpm dev` proxies `/pb` there (override with `POCKETBASE_URL` in `.env.local`),
so the in-app default server address `/pb` just works.

## What the server can and cannot see

Training rows arrive as plaintext merge metadata (owner, collection, record
id, client timestamps) plus the body as AES-GCM ciphertext under a random
data key that only the member's password or recovery code can unwrap — the
login credential is a separate derivation, so the server never holds anything
that decrypts. Gym messages are broadcast material and are stored readable,
scoped to each gym's members. Deleting an account cascades to its rows.
