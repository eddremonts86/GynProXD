import {
  KDF_ITERATIONS,
  authPassOf,
  generateRecoveryCode,
  decryptJson,
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
  activeProfile,
  activeProfileKey,
  adoptRemoteIdentity,
  adoptServerRole,
  createLinkedProfile,
  flushActiveProfile,
  profileCrypto,
  reloadActiveFromDisk,
  setActiveGymName,
} from './profiles'
import { useMessages, type PublishInput } from '../store/useMessages'
import { useMenus } from '../store/useMenus'
import {
  clearResponseDirty,
  dirtyResponses,
  isEmptyResponse,
  myResponse,
  sameResponse,
  serverMessageId,
  type MyResponse,
  type ResponseRow,
} from './gym-responses'
import type { MenuSection } from './menu'
import { isMessageScope } from './messages'
import type { GymMessage, MessageImage, TemplateKind } from './messages'

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
  options: { method?: string; token?: string; body?: unknown; form?: FormData } = {},
): Promise<T> {
  let response: Response
  try {
    response = await fetch(server + path, {
      method: options.method ?? 'GET',
      headers: {
        /* A multipart body carries its own content-type, boundary and all;
           setting one here would truncate every upload at the first part. */
        ...(options.form ? {} : { 'content-type': 'application/json' }),
        ...(options.token ? { authorization: options.token } : {}),
      },
      ...(options.form
        ? { body: options.form }
        : options.body !== undefined
          ? { body: JSON.stringify(options.body) }
          : {}),
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
 * One password does both jobs — signs devices in and decrypts the data —
 * without the server ever being able to do the second: what travels is a
 * derivation salted by the email, the data key is the same password under the
 * account's random salt, and neither yields the other or the password itself.
 *
 * The derivation itself is `authPassOf` in `./crypto`, re-exported here because
 * this is where it reads as part of the protocol. It moved so that code which
 * cannot import this module — a seeding script on a server, for one — still
 * derives the credential from the same eleven lines.
 */
export { authPassOf, generateRecoveryCode }

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
  /** The data key wrapped under the recovery code. */
  wrapped_key: CipherBlob
  /** The same data key wrapped under the password-derived KEK. */
  wrapped_dk: CipherBlob | null
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
    /* The gym bus rides along, best-effort: training sync never fails on it. */
    await syncGymBus(profileId, link).catch(() => {})
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

  /* The data key is random and permanent. The password only ever wraps it,
     so a reset or a future password change re-wraps one blob and leaves
     every encrypted row alone. */
  const key = await importKeyBase64(toBase64(randomBytes(32)))
  const check = await encryptJson(key, 'forma')

  const encSalt = randomBytes(16)
  const kek = await deriveKey(input.password, encSalt, KDF_ITERATIONS)
  const wrappedDk = await encryptJson(kek, await exportKeyBase64(key))

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
      wrapped_dk: wrappedDk,
      recovery_salt: toBase64(recoverySalt),
    },
  })

  /* Local rows re-encrypt onto the data key; the old passphrase stops being
     a thing anyone has to remember. */
  await adoptRemoteIdentity(
    profileId,
    { salt: toBase64(encSalt), iterations: KDF_ITERATIONS, check, wrap: wrappedDk },
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
    if (!state.wrapped_dk) {
      throw new Error(
        'This account predates the current sync format. Turn sync on again from the device that has your history.',
      )
    }
    const kek = await deriveKey(input.password, fromBase64(state.salt), state.iterations)
    try {
      key = await importKeyBase64(await decryptJson<string>(kek, state.wrapped_dk))
    } catch {
      throw new Error(
        'That password signs in but cannot decrypt this account — was it changed outside enForma?',
      )
    }
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
    {
      salt: state.salt,
      iterations: state.iterations,
      check: state.check,
      wrap: state.wrapped_dk ?? undefined,
    },
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
    {
      salt: state.salt,
      iterations: state.iterations,
      check: state.check,
      wrap: state.wrapped_dk ?? undefined,
    },
    key,
  )
  writeSyncLink(profileId, probe)
  const result = await syncNow(profileId)
  if (!result.ok) throw new Error(result.message)
}

/**
 * The Authorization header for server features gated to signed-in members
 * (AI coach, recipe search) — or null when the active profile has no live
 * account session, which is the caller's cue to fall back locally.
 */
/** Where this profile's sync server lives, for the calls that go direct. */
export function activeServer(): string {
  const meta = activeProfile()
  if (!meta) return '/pb'
  const link = readSyncLink(meta.id)
  return link?.server?.trim().replace(/\/+$/, '') || '/pb'
}

export function activeAuthHeader(): Record<string, string> | null {
  const meta = activeProfile()
  if (!meta) return null
  const link = readSyncLink(meta.id)
  return link?.token ? { authorization: link.token } : null
}

/* --------------------------------------------------------- gym membership */

export interface GymOption {
  id: string
  name: string
}

export interface JoinRequestRow {
  id: string
  gym: string
  owner: string
  status: string
  memberName?: string
  memberEmail?: string
}

function link(profileId: string): SyncLink {
  const l = readSyncLink(profileId)
  if (!l?.token) throw new Error('Sync is not signed in on this device.')
  return l
}

/** Gyms whose name contains the query, for the join picker. */
export async function searchGyms(profileId: string, query: string): Promise<GymOption[]> {
  const l = link(profileId)
  const q = query.trim()
  const filter = q ? `&filter=${encodeURIComponent(`name ~ "${q.replace(/"/g, '')}"`)}` : ''
  const list = await request<ListPayload<GymOption>>(
    l.server,
    `/api/collections/gyms/records?perPage=25&sort=name${filter}`,
    { token: l.token },
  )
  return list.items.map((g) => ({ id: g.id, name: g.name }))
}

/** Instant join with the gym's code. Resolves the gym's name into the profile. */
export async function joinWithCode(
  profileId: string,
  gym: GymOption,
  code: string,
): Promise<void> {
  const l = link(profileId)
  await request(l.server, '/api/enforma/join-with-code', {
    method: 'POST',
    token: l.token,
    body: { gym: gym.id, code: code.trim() },
  })
  setActiveGymName(profileId, gym.name)
  await syncNow(profileId)
}

/** File a pending request for the operator to approve. */
export async function requestToJoin(profileId: string, gym: GymOption): Promise<void> {
  const l = link(profileId)
  await request(l.server, '/api/collections/gym_join_requests/records', {
    method: 'POST',
    token: l.token,
    body: {
      owner: l.userId,
      gym: gym.id,
      status: 'pending',
      member_name: activeProfile()?.name ?? '',
      member_email: l.email,
    },
  })
}

/** The caller's own pending/decided requests, newest first. */
export async function myJoinRequests(profileId: string): Promise<JoinRequestRow[]> {
  const l = link(profileId)
  const list = await request<ListPayload<JoinRequestRow>>(
    l.server,
    `/api/collections/gym_join_requests/records?perPage=25&sort=-updated&filter=${encodeURIComponent(`owner = "${l.userId}"`)}`,
    { token: l.token },
  )
  return list.items
}

/** Leave the current gym (allowed directly; only joining is gated). */
export async function leaveGym(profileId: string): Promise<void> {
  const l = link(profileId)
  await request(l.server, `/api/collections/users/records/${l.userId}`, {
    method: 'PATCH',
    token: l.token,
    body: { gym: '' },
  })
  setActiveGymName(profileId, '')
  await syncNow(profileId)
}

/**
 * Tell the server whether gyms may reach this account.
 *
 * The switch lives in the local registry, which is enough for what this device
 * shows — but not for what the server sends. Left local, a refusal would be
 * honoured by the inbox and ignored by the read rule: the row would arrive,
 * be filtered out on the way to the screen, and still be counted as somebody
 * reached. A gym would be paying for delivery to a person who said no.
 *
 * Best-effort by design. A profile with no account has nothing to tell, and a
 * server that will not answer must not stop somebody from setting a preference
 * on their own device — the local answer is the one the inbox obeys either way.
 */
export async function setOpenToGyms(profileId: string, open: boolean): Promise<void> {
  const l = readSyncLink(profileId)
  if (!l?.token) return
  try {
    await request(l.server, `/api/collections/users/records/${l.userId}`, {
      method: 'PATCH',
      token: l.token,
      /* Phrased as the refusal, the way the column is: see the migration. */
      body: { closed_to_gyms: !open },
    })
  } catch {
    /* Said on this device regardless. */
  }
}

/* ---- operator side ---- */

/** Pending requests for the gyms this account operates, with member identity. */
export async function pendingJoinRequests(profileId: string): Promise<JoinRequestRow[]> {
  const l = link(profileId)
  const list = await request<
    ListPayload<JoinRequestRow & { member_name?: string; member_email?: string }>
  >(
    l.server,
    `/api/collections/gym_join_requests/records?perPage=100&sort=created&filter=${encodeURIComponent(`status = "pending"`)}`,
    { token: l.token },
  )
  return list.items.map((r) => ({
    id: r.id,
    gym: r.gym,
    owner: r.owner,
    status: r.status,
    memberName: r.member_name,
    memberEmail: r.member_email,
  }))
}

export async function decideJoinRequest(
  profileId: string,
  requestId: string,
  approve: boolean,
): Promise<void> {
  const l = link(profileId)
  await request(l.server, `/api/collections/gym_join_requests/records/${requestId}`, {
    method: 'PATCH',
    token: l.token,
    body: { status: approve ? 'approved' : 'denied' },
  })
}

/** The operator's current join code (null if none set yet). */
export async function gymJoinCode(profileId: string, gymId: string): Promise<string | null> {
  const l = link(profileId)
  const res = await request<{ code: string | null }>(
    l.server,
    `/api/enforma/gym/code?gym=${encodeURIComponent(gymId)}`,
    { token: l.token },
  )
  return res.code
}

export async function setGymJoinCode(profileId: string, gymId: string, code: string): Promise<void> {
  const l = link(profileId)
  await request(l.server, '/api/enforma/gym/set-code', {
    method: 'POST',
    token: l.token,
    body: { gym: gymId, code: code.trim() },
  })
}

/** This device's account id on the sync server, or null when there is none. */
export function activeSyncUserId(profileId: string): string | null {
  return readSyncLink(profileId)?.userId ?? null
}

/**
 * The address this profile's account is held under.
 *
 * Used to sign a message at the moment it is published. Reading it off the
 * later pull would have worked for a colleague's message arriving from another
 * device and not for one written here — two operators on one device publish
 * into the same local store, and the copy the sent list draws is the local one.
 */
export function activeSyncEmail(profileId: string): string | null {
  return readSyncLink(profileId)?.email ?? null
}

/** Who works this gym's desk, and who is still only invited. */
export interface DeskRow {
  id: string
  email: string
  /** The account that holds the gym. Cannot be removed. */
  isOwner: boolean
  /** True while this is only an invitation nobody has signed in against. */
  pending: boolean
}

/**
 * The desk, as the panel shows it.
 *
 * Two collections in one list because to a person they are one thing: the
 * people who can post. Whether a row is an account or an address we are waiting
 * on is a detail of how far along it is, not a different kind of entry.
 */
export async function gymDesk(profileId: string, gymId: string): Promise<DeskRow[]> {
  const l = link(profileId)
  /* Through the endpoint, not the collection: `users` is `id = @request.auth.id`,
     so fetching a colleague's row returns nothing and the first build drew them
     as an empty seat the moment they accepted. */
  const desk = await request<{ people: { id: string; email: string; owner: boolean }[] }>(
    l.server, `/api/enforma/gym/desk?gym=${encodeURIComponent(gymId)}`, { token: l.token },
  )
  const rows: DeskRow[] = desk.people.map((p) => ({
    id: p.id,
    email: p.email,
    isOwner: p.owner,
    pending: false,
  }))
  const invites = await request<ListPayload<{ id: string; email: string }>>(
    l.server,
    `/api/collections/gym_invites/records?perPage=50&filter=${encodeURIComponent(`gym = "${gymId}"`)}`,
    { token: l.token },
  ).catch(() => ({ items: [] as { id: string; email: string }[] }))
  for (const invite of invites.items) {
    rows.push({ id: invite.id, email: invite.email, isOwner: false, pending: true })
  }
  return rows
}

/** Invite an address to the desk. Says the same thing whether or not it exists. */
export async function inviteOperator(
  profileId: string,
  gymId: string,
  email: string,
): Promise<{ joined?: boolean; already?: boolean }> {
  const l = link(profileId)
  return request(l.server, '/api/enforma/gym/invite', {
    method: 'POST',
    token: l.token,
    body: { gym: gymId, email: email.trim() },
  })
}

/** Take somebody off the desk, or withdraw an invitation nobody claimed. */
export async function removeFromDesk(
  profileId: string,
  gymId: string,
  row: DeskRow,
): Promise<void> {
  const l = link(profileId)
  await request(
    l.server,
    row.pending ? '/api/enforma/gym/cancel-invite' : '/api/enforma/gym/remove-operator',
    {
      method: 'POST',
      token: l.token,
      body: row.pending ? { invite: row.id } : { gym: gymId, user: row.id },
    },
  )
}

/** The id of the gym this operator account runs, for the code/requests UI. */
export async function operatedGymId(profileId: string): Promise<string | null> {
  const l = readSyncLink(profileId)
  if (!l?.token) return null
  const gyms = await fetchGyms(l).catch(() => [])
  return gyms.find((g) => g.operators?.includes(l.userId))?.id ?? null
}

/** Refreshes an expired session. Nothing about the data or keys changes. */
export async function reauthSync(profileId: string, password: string): Promise<void> {
  const link = readSyncLink(profileId)
  if (!link) throw new Error('Sync is not set up here.')
  const auth = await authenticate(link.server, link.email, password)
  writeSyncLink(profileId, { ...link, token: auth.token, userId: auth.record.id })
}

/* ------------------------------------------------------- password reset */

/** Asks the server to email a reset token. Never says whether the email exists. */
export async function requestPasswordReset(email: string, server = ''): Promise<void> {
  await request(normalizeServer(server), '/api/collections/users/request-password-reset', {
    method: 'POST',
    body: { email: email.trim() },
  })
}

export interface ResetPasswordInput {
  name: string
  email: string
  /** From the reset email. */
  token: string
  newPassword: string
  /** The signup recovery code — the only thing that can save the data. */
  recoveryCode: string
  server?: string
}

/**
 * Resets the password without losing a row. The server accepts the new
 * login credential; the recovery code unwraps the permanent data key; the
 * key is re-wrapped under the new password and the account's salt rotates.
 * Ends signed in on this device with the history pulled.
 */
export async function resetPasswordFromGate(input: ResetPasswordInput): Promise<void> {
  const server = normalizeServer(input.server ?? '')
  const email = input.email.trim()
  const authPass = await authPassOf(email, input.newPassword)
  await request(server, '/api/collections/users/confirm-password-reset', {
    method: 'POST',
    body: { token: input.token.trim(), password: authPass, passwordConfirm: authPass },
  })

  const { probe, state, key } = await openAccount({
    server,
    email,
    password: input.newPassword,
    recoveryCode: input.recoveryCode,
  })

  const newSalt = randomBytes(16)
  const kek = await deriveKey(input.newPassword, newSalt, KDF_ITERATIONS)
  const wrappedDk = await encryptJson(kek, await exportKeyBase64(key))
  await request(server, `/api/collections/sync_state/records/${state.id}`, {
    method: 'PATCH',
    token: probe.token,
    body: { salt: toBase64(newSalt), iterations: KDF_ITERATIONS, wrapped_dk: wrappedDk },
  })

  const profileId = await createLinkedProfile(
    input.name,
    { salt: toBase64(newSalt), iterations: KDF_ITERATIONS, check: state.check, wrap: wrappedDk },
    key,
  )
  writeSyncLink(profileId, probe)
  const result = await syncNow(profileId)
  if (!result.ok) throw new Error(result.message)
}

/* ----------------------------------------------------- phase 5: gym bus */

interface GymRow {
  id: string
  name: string
  operators: string[]
  /** 'house' on the one row the platform speaks through; absent on old servers. */
  kind?: string
}

interface WireMessage {
  id: string
  gym: string
  author: string
  kind: string
  title: string
  body: string
  /** Absent on rows written before the house existed; reads as 'members'. */
  scope?: string
  /** Empty on everything published on arrival. */
  publish_at?: string
  payload: (Partial<GymMessage> & { alts?: string[] }) | null
  /** File names on the row; the URL is built from the collection and id. */
  images?: string[]
  created: string
  updated: string
}

/** Where the sync server serves an uploaded file from. */
export function fileUrl(server: string, messageId: string, name: string): string {
  return `${server}/api/files/gym_messages/${messageId}/${encodeURIComponent(name)}`
}

const sameName = (a: string | undefined, b: string | undefined): boolean =>
  !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase()

async function fetchGyms(link: SyncLink): Promise<GymRow[]> {
  const list = await request<ListPayload<GymRow>>(
    link.server,
    '/api/collections/gyms/records?perPage=200',
    { token: link.token },
  )
  return list.items
}

function messageFromWire(wire: WireMessage, gymName: string, server: string): GymMessage {
  /* The wire stores absent optionals as null; the local shape wants them gone. */
  const { alts, ...rest } = wire.payload ?? {}
  const payload = Object.fromEntries(
    Object.entries(rest).filter(([, value]) => value !== null),
  ) as Partial<GymMessage>
  /* Alt text was written before PocketBase had named the files, so the two
     lists are joined by upload order — the only thing both sides can agree on. */
  const images = (wire.images ?? []).map((name, i) => ({
    url: fileUrl(server, wire.id, name),
    ...(alts?.[i] ? { alt: alts[i] } : {}),
  }))
  return {
    audience: 'all',
    ...payload,
    id: `srv-${wire.id}`,
    gym: gymName,
    authorId: `srv-${wire.author}`,
    createdAt: new Date(wire.created.replace(' ', 'T')).toISOString(),
    kind: wire.kind as TemplateKind,
    title: wire.title,
    /* Carried through, not defaulted. A message that arrived without its scope
       would be judged as `members` — matched against the gym name — and become
       invisible to exactly the people it was written for. Asked of the list in
       messages.ts rather than a literal here: the literal was `unaffiliated` or
       `everyone`, and the day a fourth scope was added this line silently
       dropped it. */
    ...(isMessageScope(wire.scope) && wire.scope !== 'members' ? { scope: wire.scope } : {}),
    ...(wire.body ? { body: wire.body } : {}),
    /* Only when there is one: absent means published on arrival, and a row
       carrying an empty string would make every message look scheduled. */
    ...(wire.publish_at ? { publishAt: new Date(wire.publish_at.replace(' ', 'T')).toISOString() } : {}),
    ...(images.length > 0 ? { images } : {}),
    readBy: [],
    rsvp: {},
    saved: [],
  }
}

const BUS_CURSOR_PREFIX = 'forma-sync-bus-'

interface MenuRow {
  id: string
  gym: string
  sections: MenuSection[] | null
  updated: string
}

/**
 * The gym's standing kitchen card, down to a member's device.
 *
 * It used to live only in the operator's browser, which meant the priced card
 * on Today — the one surface here that leads anywhere money changes hands —
 * was invisible to every member of the gym. The public recipe took the slot
 * instead, and the free thing outranked the thing being sold.
 */
async function pullGymMenu(link: SyncLink, gymId: string, gymName: string): Promise<void> {
  const list = await request<ListPayload<MenuRow>>(
    link.server,
    `/api/collections/gym_menus/records?perPage=1&filter=${encodeURIComponent(`gym = "${gymId}"`)}`,
    { token: link.token },
  ).catch(() => null)
  const row = list?.items?.[0]
  if (!row) return
  const sections = Array.isArray(row.sections) ? row.sections : []
  if (sections.length === 0) return
  useMenus.getState().adoptMenu(gymName, sections, new Date(row.updated.replace(' ', 'T')).toISOString())
}

/**
 * The operator's save, up. Best-effort like every other bus write: a menu that
 * did not reach the server is still on the screen it was typed on, and the
 * next save carries it.
 */
export async function pushMenuToServer(
  profileId: string,
  gymName: string,
  sections: MenuSection[],
): Promise<boolean> {
  const link = readSyncLink(profileId)
  if (!link?.token) return false
  try {
    const gyms = await fetchGyms(link)
    const gym = gyms.find((g) => g.operators?.includes(link.userId) && sameName(g.name, gymName))
    if (!gym) return false
    const existing = await request<ListPayload<MenuRow>>(
      link.server,
      `/api/collections/gym_menus/records?perPage=1&filter=${encodeURIComponent(`gym = "${gym.id}"`)}`,
      { token: link.token },
    )
    const target = existing.items[0]
    await request(
      link.server,
      target
        ? `/api/collections/gym_menus/records/${target.id}`
        : '/api/collections/gym_menus/records',
      {
        method: target ? 'PATCH' : 'POST',
        token: link.token,
        body: { gym: gym.id, sections },
      },
    )
    return true
  } catch {
    return false
  }
}

/**
 * The answer back to the gym, both ways.
 *
 * Pull first, so a device that has never answered recovers what its owner said
 * elsewhere and the gym's own copy fills with its members' replies. Then push
 * only what was touched here since the last round — tracked as a dirty set,
 * because a blind push would send a fresh device's emptiness over a real
 * answer, and a blind pull would undo the tap made a second ago.
 */
async function syncGymResponses(profileId: string, link: SyncLink, memberName: string): Promise<void> {
  const keepMine = new Set(dirtyResponses(profileId))

  const rows: ResponseRow[] = []
  for (let page = 1; ; page++) {
    const list = await request<ListPayload<ResponseRow & { id: string }>>(
      link.server,
      `/api/collections/gym_responses/records?perPage=200&page=${page}`,
      { token: link.token },
    )
    rows.push(...list.items)
    if (list.page >= list.totalPages || list.items.length === 0) break
  }
  useMessages.getState().applyRemoteResponses(rows, link.userId, profileId, keepMine)

  if (keepMine.size === 0) return
  const own = new Map<string, ResponseRow & { id?: string }>()
  for (const row of rows) {
    if (row.owner === link.userId) own.set(row.message, row)
  }

  const messages = useMessages.getState().messages
  const sent: string[] = []
  for (const message of messages) {
    if (!keepMine.has(message.id)) continue
    const serverId = serverMessageId(message.id)
    if (!serverId) continue
    const mine = myResponse(message, profileId)
    const existing = own.get(serverId)
    const before: MyResponse = existing
      ? { answer: existing.answer, saved: existing.saved, joined: existing.joined, opened: existing.opened }
      : { answer: '', saved: false, joined: false, opened: false }
    if (existing && sameResponse(mine, before)) {
      sent.push(message.id)
      continue
    }
    /* Nothing to say and nothing on record: no row is the honest state, and
       it keeps the gym's table to the members who actually answered. */
    if (!existing && isEmptyResponse(mine)) {
      sent.push(message.id)
      continue
    }
    const body = { message: serverId, owner: link.userId, ...mine, member_name: memberName }
    const ok = await request(
      link.server,
      existing?.id
        ? `/api/collections/gym_responses/records/${existing.id}`
        : '/api/collections/gym_responses/records',
      { method: existing?.id ? 'PATCH' : 'POST', token: link.token, body },
    )
      .then(() => true)
      .catch(() => false)
    if (ok) sent.push(message.id)
  }
  clearResponseDirty(profileId, sent)
}

/**
 * The server side of the gym bus, ridden after every training sync:
 * a) an account that operates a gym carries the operator role onto this
 *    device, b) a member's chosen gym is registered on their account so the
 *    server can address them, c) new messages merge into the device bus,
 *    where the existing inbox, banner and notification paths pick them up.
 */
async function isPlatformAdmin(link: SyncLink): Promise<boolean> {
  const list = await request<ListPayload<{ id: string }>>(
    link.server,
    '/api/collections/platform_admins/records?perPage=1',
    { token: link.token },
  ).catch(() => null)
  return (list?.items?.length ?? 0) > 0
}

async function syncGymBus(profileId: string, link: SyncLink): Promise<void> {
  const gyms = await fetchGyms(link)
  const meta = activeProfile()
  const mine = meta && meta.id === profileId ? meta : null
  const operated = gyms.find((g) => g.operators?.includes(link.userId))

  /* For a synced profile the server is authoritative on role, overriding the
     local "first profile is the device admin" heuristic (which only governs
     offline, single-device use). Platform admin wins; then gym operator;
     otherwise member. */
  if (await isPlatformAdmin(link)) {
    adoptServerRole(profileId, 'admin')
  } else if (operated) {
    adoptServerRole(profileId, 'gym')
  } else {
    adoptServerRole(profileId, 'member')
  }

  if (operated) {
    setActiveGymName(profileId, operated.name)
  }

  /* Confirmed membership is whatever the server says users.gym is — set only
     by the code or approval routes, never pushed from here. */
  let memberGym = operated
  if (!operated) {
    const me = await request<{ gym?: string }>(
      link.server,
      `/api/collections/users/records/${link.userId}`,
      { token: link.token },
    ).catch(() => null)
    memberGym = gyms.find((g) => g.id === me?.gym)
    setActiveGymName(profileId, memberGym?.name ?? '')

    /* Bridge the old "type your gym name" habit to the approval queue: a
       synced member who named a gym locally but has no confirmed membership
       gets a pending request filed once (idempotent via the unique index). */
    if (!memberGym && mine?.gym) {
      const wanted = gyms.find((g) => sameName(g.name, mine.gym))
      if (wanted) {
        await request(link.server, '/api/collections/gym_join_requests/records', {
          method: 'POST',
          token: link.token,
          body: {
            owner: link.userId,
            gym: wanted.id,
            status: 'pending',
            member_name: mine.name,
            member_email: link.email,
          },
        }).catch(() => {})
      }
    }
  }
  if (!memberGym) return

  /* The kitchen card is not a message and has no cursor: one row per gym,
     replaced wholesale, so every sync simply takes the current one. */
  await pullGymMenu(link, memberGym.id, memberGym.name).catch(() => {})

  const cursorKey = BUS_CURSOR_PREFIX + profileId
  let cursor = ''
  try {
    cursor = localStorage.getItem(cursorKey) ?? ''
  } catch {
    /* Private mode: a full re-pull is just slower, not wrong. */
  }
  const nameOf = (id: string) => gyms.find((g) => g.id === id)?.name ?? memberGym.name

  let newCursor = cursor
  const incoming: GymMessage[] = []
  for (let page = 1; ; page++) {
    const filter = cursor ? `&filter=${encodeURIComponent(`updated > "${cursor}"`)}` : ''
    const list = await request<ListPayload<WireMessage>>(
      link.server,
      `/api/collections/gym_messages/records?perPage=200&sort=updated&page=${page}${filter}`,
      { token: link.token },
    )
    for (const wire of list.items) {
      incoming.push(messageFromWire(wire, nameOf(wire.gym), link.server))
      if (wire.updated > newCursor) newCursor = wire.updated
    }
    if (list.page >= list.totalPages || list.items.length === 0) break
  }

  if (incoming.length > 0) useMessages.getState().merge(incoming)
  if (newCursor !== cursor) {
    try {
      localStorage.setItem(cursorKey, newCursor)
    } catch {
      /* Same trade as above. */
    }
  }

  /* After the merge, never before: a response is meaningless until the message
     it answers is on this device. */
  await syncGymResponses(profileId, link, mine?.name ?? '').catch(() => {})
}

/**
 * Publishes to every device of the gym's members. Returns the bus id to use
 * for the local copy, or null when this profile cannot reach the server bus
 * (not linked, offline, or not an operator of that gym) — the caller then
 * publishes device-only, which is the honest fallback.
 */
export interface PublishedToServer {
  /** Bus id for the local copy, so the later pull does not duplicate it. */
  id: string
  /** Where the uploaded pictures ended up, ready for the device's own copy. */
  images: MessageImage[]
}

export async function publishToServer(
  profileId: string,
  input: PublishInput,
  images: { file: File; alt: string }[] = [],
): Promise<PublishedToServer | null> {
  const link = readSyncLink(profileId)
  if (!link?.token) return null
  try {
    const gyms = await fetchGyms(link)
    /**
     * The house is addressed by kind and authorised by being a platform admin,
     * so it is looked up differently: its operators list is deliberately empty
     * and matching on the name would break the day it is renamed. The server
     * re-checks both — this only decides which row to aim at.
     */
    const house = input.scope === 'unaffiliated' || input.scope === 'everyone'
    const gym = house
      ? gyms.find((g) => g.kind === 'house')
      : gyms.find((g) => g.operators?.includes(link.userId) && sameName(g.name, input.gym))
    if (!gym) return null
    const payload = {
      audience: input.audience,
      event: input.event ?? null,
      menu: input.menu ?? null,
      offer: input.offer ?? null,
      product: input.product ?? null,
      challenge: input.challenge ?? null,
      collection: input.collection ?? null,
      /* Measured before it was shipped: the largest thing this can be is an
         annual, six-day programme at ~21KB, against the row's 100KB cap. */
      programme: input.programme ?? null,
      banner: input.banner ?? null,
      link: input.link ?? null,
      /* Index-aligned with the files below, which is the only ordering both
         ends can agree on before the server has named them. */
      alts: images.map((i) => i.alt.trim()),
    }
    const form = new FormData()
    form.set('gym', gym.id)
    form.set('author', link.userId)
    form.set('kind', input.kind)
    /* A gym's message carries `members` explicitly rather than nothing: the
       server refuses a house publish with no scope, and an explicit value
       means a row's audience is never merely implied. */
    form.set('scope', input.scope ?? 'members')
    form.set('title', input.title)
    /* Set only when asked for. The server treats a field that was sent and
       arrived empty as a date it could not read, which is what catches a
       schedule that did not survive the trip — so an unscheduled message must
       not send the field at all. */
    if (input.publishAt) form.set('publish_at', input.publishAt)
    form.set('body', input.body ?? '')
    form.set('payload', JSON.stringify(payload))
    for (const { file } of images) form.append('images', file)

    const row = await request<{ id: string; images?: string[] }>(
      link.server,
      '/api/collections/gym_messages/records',
      { method: 'POST', token: link.token, form },
    )
    return {
      id: `srv-${row.id}`,
      images: (row.images ?? []).map((name, i) => ({
        url: fileUrl(link.server, row.id, name),
        ...(payload.alts[i] ? { alt: payload.alts[i] } : {}),
      })),
    }
  } catch {
    return null
  }
}
