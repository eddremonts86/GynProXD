# enForma sync server

PocketBase 0.40.1: one binary, SQLite inside, the two collections and their
owner-only rules created by `pb_migrations/` on first boot.

## Coolify

Point a compose service at this directory (`docker-compose.yml`). First boot:
open `/_/` on the service URL, create the superuser, and set SMTP under
Settings → Mail so verification and password reset can send. Give members the
service URL — each device enters it once in Settings → Data → Sync.

## Local development

```bash
mkdir -p deploy/pocketbase/.local && cd deploy/pocketbase/.local
curl -sL -o pb.zip "https://github.com/pocketbase/pocketbase/releases/download/v0.40.1/pocketbase_0.40.1_darwin_arm64.zip"
unzip -oq pb.zip
./pocketbase serve --http=127.0.0.1:8090 --dir=./pb_data --migrationsDir=../pb_migrations
```

`pnpm dev` proxies `/pb` there (override with `POCKETBASE_URL` in `.env.local`),
so the in-app default server address `/pb` just works.

## What the server can and cannot see

Rows arrive as plaintext merge metadata (owner, collection, record id, client
timestamps) plus the training data as AES-GCM ciphertext sealed by the
profile passphrase. The server authenticates devices and merges rows; it can
never read a workout. Deleting an account cascades to its rows.
