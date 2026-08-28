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
import type { GymMessage, TemplateKind } from './messages'

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
    body: { owner: l.userId, gym: gym.id, status: 'pending' },
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

/* ---- operator side ---- */

/** Pending requests for the gyms this account operates, with member identity. */
export async function pendingJoinRequests(profileId: string): Promise<JoinRequestRow[]> {
  const l = link(profileId)
  const list = await request<ListPayload<JoinRequestRow & { expand?: { owner?: { name?: string; email?: string } } }>>(
    l.server,
    `/api/collections/gym_join_requests/records?perPage=100&sort=created&expand=owner&filter=${encodeURIComponent(`status = "pending"`)}`,
    { token: l.token },
  )
  return list.items.map((r) => ({
    id: r.id,
    gym: r.gym,
    owner: r.owner,
    status: r.status,
    memberName: r.expand?.owner?.name,
    memberEmail: r.expand?.owner?.email,
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
}

interface WireMessage {
  id: string
  gym: string
  author: string
  kind: string
  title: string
  body: string
  payload: Partial<GymMessage> | null
  created: string
  updated: string
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

function messageFromWire(wire: WireMessage, gymName: string): GymMessage {
  /* The wire stores absent optionals as null; the local shape wants them gone. */
  const payload = Object.fromEntries(
    Object.entries(wire.payload ?? {}).filter(([, value]) => value !== null),
  ) as Partial<GymMessage>
  return {
    audience: 'all',
    ...payload,
    id: `srv-${wire.id}`,
    gym: gymName,
    authorId: `srv-${wire.author}`,
    createdAt: new Date(wire.created.replace(' ', 'T')).toISOString(),
    kind: wire.kind as TemplateKind,
    title: wire.title,
    ...(wire.body ? { body: wire.body } : {}),
    readBy: [],
    rsvp: {},
    saved: [],
  }
}

const BUS_CURSOR_PREFIX = 'forma-sync-bus-'

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

  /* Role is the server's to decide, adopted onto this device. Platform admin
     wins; then gym operator; a former operator drops back to member. A purely
     local device-admin (no server backing) is left untouched. */
  if (await isPlatformAdmin(link)) {
    adoptServerRole(profileId, 'admin')
  } else if (operated) {
    if (mine?.role !== 'admin') adoptServerRole(profileId, 'gym')
  } else if (mine?.role === 'gym') {
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
          body: { owner: link.userId, gym: wanted.id, status: 'pending' },
        }).catch(() => {})
      }
    }
  }
  if (!memberGym) return

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
      incoming.push(messageFromWire(wire, nameOf(wire.gym)))
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
}

/**
 * Publishes to every device of the gym's members. Returns the bus id to use
 * for the local copy, or null when this profile cannot reach the server bus
 * (not linked, offline, or not an operator of that gym) — the caller then
 * publishes device-only, which is the honest fallback.
 */
export async function publishToServer(
  profileId: string,
  input: PublishInput,
): Promise<string | null> {
  const link = readSyncLink(profileId)
  if (!link?.token) return null
  try {
    const gyms = await fetchGyms(link)
    const gym = gyms.find(
      (g) => g.operators?.includes(link.userId) && sameName(g.name, input.gym),
    )
    if (!gym) return null
    const row = await request<{ id: string }>(link.server, '/api/collections/gym_messages/records', {
      method: 'POST',
      token: link.token,
      body: {
        gym: gym.id,
        author: link.userId,
        kind: input.kind,
        title: input.title,
        body: input.body ?? '',
        payload: {
          audience: input.audience,
          event: input.event ?? null,
          menu: input.menu ?? null,
          offer: input.offer ?? null,
          challenge: input.challenge ?? null,
          collection: input.collection ?? null,
          banner: input.banner ?? null,
          link: input.link ?? null,
        },
      },
    })
    return `srv-${row.id}`
  } catch {
    return null
  }
}
