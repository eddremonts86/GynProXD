/**
 * Seed the two default sync accounts every app in this fleet is expected to
 * have, so there is always something to sign in as.
 *
 *   node --env-file=<env> scripts/admin/seed-default-accounts.ts --server URL
 *
 * Reads, from the environment (dev-env/env-config/.env holds all four):
 *
 *   DEFAULT_ADMIN_EMAIL / DEFAULT_ADMIN_PASSWORD   → account + platform admin
 *   DEFAULT_USER_EMAIL  / DEFAULT_USER_PASSWORD    → ordinary member account
 *   PB_SUPERUSER_EMAIL  / PB_SUPERUSER_PASSWORD    → the PocketBase superuser (PB_SU_* still read)
 *
 * Idempotent: an account that already exists is left alone rather than having
 * its password reset, because on this server a password is not a login detail —
 * it wraps the account's data key, and rewriting it from outside the app would
 * strand every encrypted row behind a key nobody holds. Re-running reports what
 * was already there.
 *
 * ## What this does not do, and cannot
 *
 * It creates the SERVER half of an identity. enForma keeps a second one: the
 * local profile, whose key is derived from a passphrase inside the browser and
 * written to `localStorage`. No process outside that browser can produce one.
 *
 * So the seeded admin is not "log in and you are admin" the way it is in the
 * apps backed by Postgres and better-auth. The path is:
 *
 *   1. create a local profile in the app (a name and a passphrase)
 *   2. Sign in to sync with DEFAULT_ADMIN_EMAIL / DEFAULT_ADMIN_PASSWORD
 *   3. the next sync reads `platform_admins` and adopts role 'admin'
 *      (src/lib/sync.ts, syncGymBus)
 *
 * Step 3 is the reason this script grants platform admin rather than leaving it
 * to `grant-admin.mjs`: an admin account that is not marked is an ordinary
 * member, and the surfaces you seeded it to reach stay invisible.
 */
import {
  KDF_ITERATIONS,
  authPassOf,
  deriveKey,
  encryptJson,
  exportKeyBase64,
  generateRecoveryCode,
  importKeyBase64,
  randomBytes,
  toBase64,
} from '../../src/lib/crypto.ts'

interface Args {
  server?: string
  force?: boolean
}

const args: Args = {}
for (let i = 2; i < process.argv.length; i += 1) {
  const flag = process.argv[i]
  if (!flag.startsWith('--')) continue
  const next = process.argv[i + 1]
  const value = next && !next.startsWith('--') ? next : true
  if (flag === '--server') args.server = value as string
  if (flag === '--force') args.force = value === true || value === 'true'
}

const SERVER = (args.server ?? process.env.ENFORMA_SYNC_URL ?? '').replace(/\/+$/, '')
const SU_EMAIL = process.env.PB_SUPERUSER_EMAIL ?? process.env.PB_SU_EMAIL
const SU_PASSWORD = process.env.PB_SUPERUSER_PASSWORD ?? process.env.PB_SU_PASSWORD

const ACCOUNTS = [
  {
    label: 'admin',
    email: process.env.DEFAULT_ADMIN_EMAIL,
    password: process.env.DEFAULT_ADMIN_PASSWORD,
    platformAdmin: true,
  },
  {
    label: 'member',
    email: process.env.DEFAULT_USER_EMAIL,
    password: process.env.DEFAULT_USER_PASSWORD,
    platformAdmin: false,
  },
] as const

function fail(message: string): never {
  console.error(`\n  ${message}\n`)
  process.exit(1)
}

if (!SERVER) {
  fail('No server. Pass --server http://… (or set ENFORMA_SYNC_URL).')
}
if (!SU_EMAIL || !SU_PASSWORD) {
  fail('No superuser. Set PB_SUPERUSER_EMAIL and PB_SUPERUSER_PASSWORD — the pair the sync server booted with.')
}

const missing = ACCOUNTS.filter((a) => !a.email || !a.password).map((a) => a.label)
if (missing.length > 0) {
  fail(
    `Missing credentials for: ${missing.join(', ')}.\n`
      + '  Expected DEFAULT_ADMIN_EMAIL / DEFAULT_ADMIN_PASSWORD and\n'
      + '  DEFAULT_USER_EMAIL / DEFAULT_USER_PASSWORD in the environment.\n'
      + '  They live in ai-os/dev-env/env-config/.env — pass it with --env-file.',
  )
}

/**
 * A public server gets no well-known accounts by accident.
 *
 * The other apps in this fleet guard their seed on NODE_ENV, which does not
 * reach here — this talks to a server over HTTP and has no opinion about the
 * process it runs in. The address is the honest signal: anything that is not
 * plainly local needs `--force` and a person who meant it.
 */
const local = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(SERVER)
  || /\.localhost(:\d+)?$/i.test(SERVER)
if (!local && !args.force) {
  fail(
    `${SERVER} is not a local address.\n`
      + '  These are default credentials and a platform-admin grant. Seeding them onto a\n'
      + '  reachable server hands anyone who reads a repository the admin account.\n'
      + '  Pass --force if this is deliberate.',
  )
}

interface CallOptions {
  method?: string
  token?: string
  body?: unknown
}

async function call<T>(path: string, options: CallOptions = {}): Promise<T> {
  const res = await fetch(SERVER + path, {
    method: options.method ?? 'GET',
    headers: {
      'content-type': 'application/json',
      ...(options.token ? { authorization: options.token } : {}),
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(`${options.method ?? 'GET'} ${path} → ${res.status} ${JSON.stringify(data).slice(0, 300)}`)
  }
  return data as T
}

interface ListPayload<T> {
  items: T[]
}

/** Printed once at the end: the only moment these exist outside a wrapped blob. */
const recoveryCodes: string[] = []

const su = await call<{ token: string }>('/api/collections/_superusers/auth-with-password', {
  method: 'POST',
  body: { identity: SU_EMAIL, password: SU_PASSWORD },
})
const token = su.token

for (const account of ACCOUNTS) {
  const email = account.email!
  const password = account.password!

  const found = await call<ListPayload<{ id: string }>>(
    `/api/collections/users/records?filter=${encodeURIComponent(`email = "${email}"`)}`,
    { token },
  )
  let user = found.items[0] ?? null

  if (user) {
    console.log(`  ${account.label.padEnd(6)} ${email} — already exists, left alone`)
  } else {
    /**
     * The credential is derived, never the password itself.
     *
     * `createSyncAccount` sends `authPassOf(email, password)` and so does every
     * sign-in, so an account created with the raw password is one the app can
     * never present a matching credential for: it would exist, the superuser
     * would see it, `grant-admin.mjs` would mark it admin, and signing in from
     * the app would fail with bad credentials and no clue why. Importing the
     * app's own function is what keeps the two ends the same.
     */
    const authPass = await authPassOf(email, password)
    user = await call<{ id: string }>('/api/collections/users/records', {
      method: 'POST',
      token,
      body: { email, password: authPass, passwordConfirm: authPass, emailVisibility: false },
    })

    /**
     * The account is not usable yet, and this is the half that is easy to miss.
     *
     * A `users` row authenticates. It does not make an enForma account: the app
     * refuses to link one that has no `sync_state`, with "That account holds no
     * training data yet" — correctly, because linking is a *pull*, and there is
     * nothing on the far side to pull. Both entry points refuse it, so an
     * account seeded without this is one nobody can sign into from the product
     * even though every server-side check passes.
     *
     * So the same ceremony `createSyncAccount` performs: a random data key,
     * wrapped twice — once under the password so the account opens with it, once
     * under a one-time recovery code so a forgotten password is survivable — plus
     * a sentinel the app decrypts to prove a secret is the right one. The server
     * receives only wrapped blobs and can open none of them.
     */
    const auth = await call<{ token: string; record: { id: string } }>(
      '/api/collections/users/auth-with-password',
      { method: 'POST', body: { identity: email, password: authPass } },
    )
    const dataKey = await importKeyBase64(toBase64(randomBytes(32)))
    const check = await encryptJson(dataKey, 'forma')

    const encSalt = randomBytes(16)
    const kek = await deriveKey(password, encSalt, KDF_ITERATIONS)
    const wrappedDk = await encryptJson(kek, await exportKeyBase64(dataKey))

    const recoveryCode = generateRecoveryCode()
    const recoverySalt = randomBytes(16)
    const wrapKey = await deriveKey(recoveryCode, recoverySalt)
    const wrapped = await encryptJson(wrapKey, await exportKeyBase64(dataKey))

    await call('/api/collections/sync_state/records', {
      method: 'POST',
      token: auth.token,
      body: {
        owner: auth.record.id,
        salt: toBase64(encSalt),
        iterations: KDF_ITERATIONS,
        check,
        wrapped_key: wrapped,
        wrapped_dk: wrappedDk,
        recovery_salt: toBase64(recoverySalt),
      },
    })
    recoveryCodes.push(`${account.label}\t${email}\t${recoveryCode}`)
    console.log(`  ${account.label.padEnd(6)} ${email} — created, with key material`)
  }

  if (!account.platformAdmin) continue

  const grants = await call<ListPayload<{ id: string }>>(
    `/api/collections/platform_admins/records?filter=${encodeURIComponent(`owner = "${user.id}"`)}`,
    { token },
  )
  if (grants.items[0]) {
    console.log(`  ${' '.repeat(6)} already a platform admin`)
  } else {
    await call('/api/collections/platform_admins/records', {
      method: 'POST',
      token,
      body: { owner: user.id },
    })
    console.log(`  ${' '.repeat(6)} granted platform admin`)
  }
}

if (recoveryCodes.length > 0) {
  console.log(
    '\n  Recovery codes — shown once, never recoverable, and the only way back into an\n'
      + '  account whose password is lost. The server holds them wrapped and cannot read them.\n',
  )
  for (const line of recoveryCodes) console.log(`    ${line}`)
}

console.log(
  '\n  Server half done. These accounts have no local profile — nothing outside a\n'
    + '  browser can make one. In the app: create a profile, then Settings → Data →\n'
    + '  "I already have one", and sign in with the admin address above. The role\n'
    + '  arrives on the next sync.\n',
)
