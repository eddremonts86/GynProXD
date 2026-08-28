import {
  KDF_ITERATIONS,
  decryptJson,
  deriveBitsBase64,
  deriveKey,
  encryptJson,
  exportKeyBase64,
  fromBase64,
  importKeyBase64,
  randomBytes,
  toBase64,
  type CipherBlob,
} from './crypto'
import { recordKey, type Collection, type RecordMeta } from './records'
import { listEnvelopes, writeRemoteEnvelope, type EnvelopeRow } from './record-store'
import {
  activeProfileKey,
  adoptRemoteIdentity,
  createLinkedProfile,
  flushActiveProfile,
  profileCrypto,
  reloadActiveFromDisk,
} from './profiles'

/**
 * Cross-device sync against a PocketBase instance (deploy/pocketbase).
 *
 * The engine moves envelopes: plaintext metadata for merging, the body as the
 * same AES-GCM ciphertext that sits in localStorage. The server authenticates
 * accounts and stores rows; it can never read a workout. Merging is
 * per-record last-write-wins on the client clock, tombstones travel like any
 * other row, and the active workout never leaves the device — all per
 * docs/plans/2026-08-26-backend-sync.md.
 *
 * An account is opt-in. The email/password pair only signs devices in; the
 * encryption key still comes from the profile passphrase (or, once, from the
 * recovery code generated at signup).
 */

const LINK_PREFIX = 'forma-sync-'
const DEFAULT_SERVER = '/pb'
const PAGE_SIZE = 200
const FETCH_TIMEOUT_MS = 15_000

export interface SyncLink {
  server: string
  email: string
  userId: string
  /** Empty when the session expired; sign in again refreshes it. */
  token: string
  /** PocketBase `updated` of the newest row this device has pulled. */
  cursor: string
  lastSyncAt?: string
}

export type SyncFailure = 'unlinked' | 'offline' | 'expired' | 'busy' | 'server'

export type SyncResult =
  | { ok: true; pulled: number; pushed: number }
  | { ok: false; reason: SyncFailure; message: string }

/* ----------------------------------------------------------------- link */

function linkKey(profileId: string): string {
  return LINK_PREFIX + profileId
}

export function readSyncLink(profileId: string): SyncLink | null {
  try {
    const raw = localStorage.getItem(linkKey(profileId))
    if (!raw) return null
    const link = JSON.parse(raw) as SyncLink
    return link.email && link.server ? link : null
  } catch {
    return null
  }
}

function writeSyncLink(profileId: string, link: SyncLink): void {
  localStorage.setItem(linkKey(profileId), JSON.stringify(link))
}

/** Forgets the account on this device. Local rows stay exactly as they are. */
export function unlinkSync(profileId: string): void {
  localStorage.removeItem(linkKey(profileId))
}

export function normalizeServer(input: string): string {
  const trimmed = input.trim().replace(/\/+$/, '')
  return trimmed === '' ? DEFAULT_SERVER : trimmed
}

/* ------------------------------------------------------------ pure logic */

/** The caller merges; a tie keeps the local row so a re-pull is a no-op. */
export function remoteWins(remote: RecordMeta, local: RecordMeta | undefined): boolean {
  if (!local) return true
  return remote.updatedAt > local.updatedAt
}

export interface ServerRow {
  serverId: string
  updatedClient: string
}

export interface PushPlan {
  creates: EnvelopeRow[]
  updates: { row: EnvelopeRow; serverId: string }[]
}

/** Rows the server lacks or holds an older copy of. */
export function planPush(
  local: readonly EnvelopeRow[],
  server: ReadonlyMap<string, ServerRow>,
): PushPlan {
  const plan: PushPlan = { creates: [], updates: [] }
  for (const row of local) {
    const known = server.get(recordKey(row.meta.collection, row.meta.id))
    if (!known) plan.creates.push(row)
    else if (row.meta.updatedAt > known.updatedClient)
      plan.updates.push({ row, serverId: known.serverId })
  }
  return plan
}

/** 25 characters, 5 bits each, no confusable letters. Shown exactly once. */
export function generateRecoveryCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = randomBytes(25)
  let code = ''
  for (let i = 0; i < bytes.length; i++) {
    if (i > 0 && i % 5 === 0) code += '-'
    code += alphabet[bytes[i] & 31]
  }
  return code
}

interface WireRecord {
  id: string
  col: string
  rid: string
  created_client: string
  updated_client: string
  deleted_client: string
  blob: CipherBlob | null
  updated: string
}

export function toWire(row: EnvelopeRow, owner: string): Record<string, unknown> {
  return {
    owner,
    col: row.meta.collection,
    rid: row.meta.id,
    created_client: row.meta.createdAt,
    updated_client: row.meta.updatedAt,
    deleted_client: row.meta.deletedAt ?? '',
    blob: row.meta.deletedAt ? null : (row.blob ?? null),
  }
}

export function fromWire(wire: WireRecord): EnvelopeRow {
  const meta: RecordMeta = {
    id: wire.rid,
    collection: wire.col as Collection,
    createdAt: wire.created_client || wire.updated_client,
    updatedAt: wire.updated_client,
    ...(wire.deleted_client ? { deletedAt: wire.deleted_client } : {}),
  }
  return wire.blob && !wire.deleted_client ? { meta, blob: wire.blob } : { meta }
}

/* ------------------------------------------------------------- transport */

class SyncError extends Error {
  readonly reason: SyncFailure

  constructor(reason: SyncFailure, message: string) {
    super(message)
    this.reason = reason
  }
}

async function request<T>(
  server: string,
  path: string,
  options: { method?: string; token?: string; body?: unknown } = {},
): Promise<T> {
  let response: Response
  try {
    response = await fetch(server + path, {
      method: options.method ?? 'GET',
      headers: {
        'content-type': 'application/json',
        ...(options.token ? { authorization: options.token } : {}),
      },
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
  } catch {
    throw new SyncError('offline', 'The sync server did not answer.')
  }
  if (response.status === 401 || response.status === 403) {
    throw new SyncError('expired', 'The session expired. Sign in again to keep syncing.')
  }
  const payload = (await response.json().catch(() => ({}))) as T & { message?: string }
  if (!response.ok) {
    throw new SyncError('server', payload.message || `The server answered ${response.status}.`)
  }
  return payload
}

interface AuthPayload {
  token: string
  record: { id: string }
}

/**
 * The server-facing credential. One password does both jobs — signs devices
 * in and decrypts the data — without the server ever being able to do the
 * second: what travels is a derivation salted by the email, the data key is
 * the same password under the account's random salt, and neither yields the
 * other or the password itself.
 */
export async function authPassOf(email: string, password: string): Promise<string> {
  const salt = new TextEncoder().encode(`enforma-auth:${email.trim().toLowerCase()}`)
  return deriveBitsBase64(password, salt, KDF_ITERATIONS)
}

async function authenticate(server: string, email: string, password: string): Promise<AuthPayload> {
  return request<AuthPayload>(server, '/api/collections/users/auth-with-password', {
    method: 'POST',
    body: { identity: email, password: await authPassOf(email, password) },
  })
}

interface ListPayload<T> {
  page: number
  totalPages: number
  items: T[]
}

interface SyncStatePayload {
  id: string
  salt: string
  iterations: number
  check: CipherBlob
  wrapped_key: CipherBlob
  recovery_salt: string
}

async function fetchSyncState(link: SyncLink): Promise<SyncStatePayload | null> {
  const list = await request<ListPayload<SyncStatePayload>>(
    link.server,
    '/api/collections/sync_state/records?perPage=1',
    { token: link.token },
  )
  return list.items[0] ?? null
}

/* ---------------------------------------------------------------- engine */

let syncing = false

/**
 * One full round: flush, pull what other devices wrote, push what this one
 * did. Small enough to run on every unlock and after the user asks.
 */
export async function syncNow(profileId: string): Promise<SyncResult> {
  const link = readSyncLink(profileId)
  if (!link) return { ok: false, reason: 'unlinked', message: 'Sync is not set up here.' }
  if (!link.token)
    return { ok: false, reason: 'expired', message: 'The session expired. Sign in again.' }
  if (syncing) return { ok: false, reason: 'busy', message: 'A sync is already running.' }
  syncing = true
  try {
    await flushActiveProfile()

    const local = new Map(listEnvelopes(profileId).map((row) => [rowKey(row), row]))
    const server = new Map<string, ServerRow>()
    let cursor = link.cursor
    let pulled = 0

    /* Pull every page newer than the cursor. This device's own past pushes
       come back too; the tie rule makes them no-ops beyond moving the cursor. */
    for (let page = 1; ; page++) {
      const filter = cursor ? `&filter=${encodeURIComponent(`updated > "${cursor}"`)}` : ''
      const list = await request<ListPayload<WireRecord>>(
        link.server,
        `/api/collections/records/records?perPage=${PAGE_SIZE}&sort=updated&page=${page}${filter}`,
        { token: link.token },
      )
      for (const wire of list.items) {
        const row = fromWire(wire)
        const key = rowKey(row)
        server.set(key, { serverId: wire.id, updatedClient: wire.updated_client })
        if (remoteWins(row.meta, local.get(key)?.meta)) {
          writeRemoteEnvelope(profileId, row)
          local.set(key, row)
          pulled++
        }
        if (wire.updated > cursor) cursor = wire.updated
      }
      if (list.page >= list.totalPages || list.items.length === 0) break
    }

    /* First sync starts with an empty cursor, so `server` already indexes the
       whole account; later syncs only index what changed, and anything the
       server has never seen is a create either way. */
    const plan = planPush([...local.values()], server)
    let pushed = 0
    for (const row of plan.creates) {
      await pushCreate(link, row)
      pushed++
    }
    for (const { row, serverId } of plan.updates) {
      await request(link.server, `/api/collections/records/records/${serverId}`, {
        method: 'PATCH',
        token: link.token,
        body: toWire(row, link.userId),
      })
      pushed++
    }

    writeSyncLink(profileId, { ...link, cursor, lastSyncAt: new Date().toISOString() })
    if (pulled > 0) await reloadActiveFromDisk()
    return { ok: true, pulled, pushed }
  } catch (error) {
    if (error instanceof SyncError) {
      if (error.reason === 'expired') writeSyncLink(profileId, { ...link, token: '' })
      return { ok: false, reason: error.reason, message: error.message }
    }
    return { ok: false, reason: 'server', message: 'Sync failed in an unexpected way.' }
  } finally {
    syncing = false
  }
}

function rowKey(row: EnvelopeRow): string {
  return recordKey(row.meta.collection, row.meta.id)
}

/** A create that loses a race to another device falls back to an update. */
async function pushCreate(link: SyncLink, row: EnvelopeRow): Promise<void> {
  try {
    await request(link.server, '/api/collections/records/records', {
      method: 'POST',
      token: link.token,
      body: toWire(row, link.userId),
    })
  } catch (error) {
    if (!(error instanceof SyncError) || error.reason !== 'server') throw error
    const filter = encodeURIComponent(`col = "${row.meta.collection}" && rid = "${row.meta.id}"`)
    const list = await request<ListPayload<WireRecord>>(
      link.server,
      `/api/collections/records/records?perPage=1&filter=${filter}`,
      { token: link.token },
    )
    const existing = list.items[0]
    if (!existing) throw error
    if (row.meta.updatedAt > existing.updated_client) {
      await request(link.server, `/api/collections/records/records/${existing.id}`, {
        method: 'PATCH',
        token: link.token,
        body: toWire(row, link.userId),
      })
    }
  }
}

/* -------------------------------------------------------------- accounts */

export interface CreateAccountInput {
  server: string
  email: string
  password: string
}

/**
 * Creates the account from the device that owns the data. One password from
 * here on: the account's data key is derived from it under a fresh salt, the
 * local rows move onto that key (so this profile now unlocks with the
 * password), the login credential is a separate derivation, and the key also
 * gets wrapped under a one-time recovery code. Then every row is pushed.
 */
export async function createSyncAccount(
  profileId: string,
  input: CreateAccountInput,
): Promise<{ recoveryCode: string }> {
  if (!profileCrypto(profileId) || !activeProfileKey())
    throw new Error('The profile must be unlocked to set up sync.')
  const server = normalizeServer(input.server)

  await request(server, '/api/collections/users/records', {
    method: 'POST',
    body: {
      email: input.email,
      password: await authPassOf(input.email, input.password),
      passwordConfirm: await authPassOf(input.email, input.password),
    },
  })
  const auth = await authenticate(server, input.email, input.password)

  const encSalt = randomBytes(16)
  const key = await deriveKey(input.password, encSalt, KDF_ITERATIONS)
  const check = await encryptJson(key, 'forma')

  const recoveryCode = generateRecoveryCode()
  const recoverySalt = randomBytes(16)
  const wrapKey = await deriveKey(recoveryCode, recoverySalt)
  const wrapped = await encryptJson(wrapKey, await exportKeyBase64(key))

  await request(server, '/api/collections/sync_state/records', {
    method: 'POST',
    token: auth.token,
    body: {
      owner: auth.record.id,
      salt: toBase64(encSalt),
      iterations: KDF_ITERATIONS,
      check,
      wrapped_key: wrapped,
      recovery_salt: toBase64(recoverySalt),
    },
  })

  /* Local rows re-encrypt onto the password-derived key; the old passphrase
     stops being a thing anyone has to remember. */
  await adoptRemoteIdentity(
    profileId,
    { salt: toBase64(encSalt), iterations: KDF_ITERATIONS, check },
    key,
  )

  writeSyncLink(profileId, {
    server,
    email: input.email,
    userId: auth.record.id,
    token: auth.token,
    cursor: '',
  })
  await syncNow(profileId)
  return { recoveryCode }
}

export interface LinkAccountInput {
  server: string
  email: string
  password: string
  /** Kept for the future password-reset flow: unwraps the key without it. */
  recoveryCode?: string
}

/**
 * Signs into an account and proves the secret can actually decrypt it:
 * authenticates, fetches the account's KDF material, derives (or unwraps)
 * the key and verifies it against the sentinel before anyone touches rows.
 */
async function openAccount(input: LinkAccountInput): Promise<{
  probe: SyncLink
  state: SyncStatePayload
  key: CryptoKey
}> {
  const server = normalizeServer(input.server)
  const auth = await authenticate(server, input.email, input.password)
  const probe: SyncLink = {
    server,
    email: input.email,
    userId: auth.record.id,
    token: auth.token,
    cursor: '',
  }
  const state = await fetchSyncState(probe)
  if (!state) {
    throw new Error(
      'That account holds no training data yet. Turn on sync from the device that has your history.',
    )
  }

  let key: CryptoKey
  if (input.recoveryCode) {
    const wrapKey = await deriveKey(
      input.recoveryCode.trim().toUpperCase(),
      fromBase64(state.recovery_salt),
    )
    try {
      key = await importKeyBase64(await decryptJson<string>(wrapKey, state.wrapped_key))
    } catch {
      throw new Error('That recovery code does not open this account.')
    }
  } else {
    key = await deriveKey(input.password, fromBase64(state.salt), state.iterations)
  }
  try {
    await decryptJson<string>(key, state.check)
  } catch {
    throw new Error(
      input.recoveryCode
        ? 'That recovery code does not open this account.'
        : 'That password signs in but cannot decrypt this account — was it changed outside enForma?',
    )
  }
  return { probe, state, key }
}

/**
 * Joins this profile to an existing account: verifies the secret against the
 * account's sentinel, re-encrypts local rows under the account key, then
 * merges both histories. The profile unlocks with the account passphrase
 * from here on.
 */
export async function linkSyncAccount(profileId: string, input: LinkAccountInput): Promise<void> {
  const { probe, state, key } = await openAccount(input)
  await adoptRemoteIdentity(
    profileId,
    { salt: state.salt, iterations: state.iterations, check: state.check },
    key,
  )
  writeSyncLink(profileId, probe)
  const result = await syncNow(profileId)
  if (!result.ok) throw new Error(result.message)
}

export interface GateSignInInput {
  name: string
  email: string
  password: string
  /** Self-hosters pointing elsewhere; everyone else gets the app's own /pb. */
  server?: string
}

/**
 * The one-step second device: sign in from the lock screen with the same
 * email and password as anywhere, and the training appears. Creates a local
 * profile already carrying the account's crypto identity — no throwaway
 * profile, no manual linking, no server address, no extra secret.
 */
export async function signInFromGate(input: GateSignInInput): Promise<void> {
  const { probe, state, key } = await openAccount({
    server: input.server ?? '',
    email: input.email,
    password: input.password,
  })
  const profileId = await createLinkedProfile(
    input.name,
    { salt: state.salt, iterations: state.iterations, check: state.check },
    key,
  )
  writeSyncLink(profileId, probe)
  const result = await syncNow(profileId)
  if (!result.ok) throw new Error(result.message)
}

/** Refreshes an expired session. Nothing about the data or keys changes. */
export async function reauthSync(profileId: string, password: string): Promise<void> {
  const link = readSyncLink(profileId)
  if (!link) throw new Error('Sync is not set up here.')
  const auth = await authenticate(link.server, link.email, password)
  writeSyncLink(profileId, { ...link, token: auth.token, userId: auth.record.id })
}
