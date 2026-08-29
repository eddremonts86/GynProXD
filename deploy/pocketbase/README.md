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
