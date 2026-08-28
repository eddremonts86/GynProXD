import {
  KDF_ITERATIONS,
  decryptJson,
  deriveKey,
  encryptJson,
  exportKeyBase64,
  importKeyBase64,
  randomBytes,
  toBase64,
  fromBase64,
  type CipherBlob,
} from './crypto'
import {
  clearProfileRecords,
  emptyCache,
  loadProfileRecords,
  persistProfile,
  reencryptProfileRecords,
  writeAllRecords,
  type RecordCache,
} from './record-store'
import { withRecordIds } from './records'
import { EMPTY_SNAPSHOT, hydrateGym, snapshotGym, useGym, type GymSnapshot } from '../store/useGym'

/**
 * Local profiles. Each person on this device gets their own encrypted store:
 * the key is derived from their passphrase and held in memory (mirrored to
 * sessionStorage so a mid-workout refresh does not demand the passphrase;
 * closing the browser locks). Nothing about a profile is readable without it.
 */

export type ProfileRole = 'member' | 'gym' | 'admin'

export interface ProfileMeta {
  id: string
  name: string
  /** Gym the person trains at — or, for a gym-role profile, the gym it runs. */
  gym?: string
  /** Panel access. Gates navigation, never cryptography. Absent = member. */
  role?: ProfileRole
  createdAt: string
  kdf: { salt: string; iterations: number }
  /** A small encrypted sentinel, used to verify a passphrase on unlock. */
  check: CipherBlob
  /**
   * Synced profiles only: the account's random data key, wrapped by the
   * password-derived KEK. Unlock unwraps instead of deriving directly, so a
   * password rotation re-wraps one blob and never re-encrypts a row.
   */
  wrap?: CipherBlob
}

interface Registry {
  profiles: ProfileMeta[]
  lastActiveId?: string
  /** Device-wide gym catalogue, so new profiles can pick an existing one. */
  gyms?: string[]
}

const REGISTRY_KEY = 'forma-profiles'
/* The whole snapshot as one encrypted blob. Superseded by per-record rows;
   still read once, to break an existing profile apart on first unlock. */
const LEGACY_BLOB_PREFIX = 'forma-data-'
const LEGACY_KEY = 'gynproxd-v2'
const SESSION_ID_KEY = 'forma-session-profile'
const SESSION_RAW_KEY = 'forma-session-key'
const SENTINEL = 'forma'

let activeKey: CryptoKey | null = null
let activeId: string | null = null
let activeCache: RecordCache = emptyCache()
let unsubscribe: (() => void) | null = null
let saveTimer: number | null = null

function readRegistry(): Registry {
  try {
    const raw = localStorage.getItem(REGISTRY_KEY)
    if (!raw) return { profiles: [] }
    const parsed = JSON.parse(raw) as Registry
    return Array.isArray(parsed.profiles) ? parsed : { profiles: [] }
  } catch {
    return { profiles: [] }
  }
}

function writeRegistry(registry: Registry): void {
  localStorage.setItem(REGISTRY_KEY, JSON.stringify(registry))
}

export interface ProfileSummary {
  id: string
  name: string
  gym?: string
  role: ProfileRole
  createdAt: string
}

export function listProfiles(): ProfileSummary[] {
  return readRegistry().profiles.map(({ id, name, gym, role, createdAt }) => ({
    id,
    name,
    gym,
    role: role ?? 'member',
    createdAt,
  }))
}

/** Every gym known on this device: the catalogue plus any profile's gym. */
export function listGyms(): string[] {
  const registry = readRegistry()
  const seen = new Map<string, string>()
  for (const gym of [...(registry.gyms ?? []), ...registry.profiles.map((p) => p.gym ?? '')]) {
    const trimmed = gym.trim()
    if (trimmed && !seen.has(trimmed.toLowerCase())) seen.set(trimmed.toLowerCase(), trimmed)
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b))
}

function rememberGym(registry: Registry, gym: string | undefined): void {
  const trimmed = gym?.trim()
  if (!trimmed) return
  const gyms = registry.gyms ?? []
  if (!gyms.some((g) => g.toLowerCase() === trimmed.toLowerCase())) {
    registry.gyms = [...gyms, trimmed]
  }
}

export function lastActiveProfileId(): string | undefined {
  return readRegistry().lastActiveId
}

export function activeProfile(): {
  id: string
  name: string
  gym?: string
  role: ProfileRole
} | null {
  if (!activeId) return null
  const meta = readRegistry().profiles.find((p) => p.id === activeId)
  return meta
    ? { id: meta.id, name: meta.name, gym: meta.gym, role: meta.role ?? 'member' }
    : null
}

/**
 * Edits a profile's public record: name and gym. These live outside the
 * encryption on purpose (the lock screen shows them), so any unlocked user
 * can administer them. Training data stays sealed under each passphrase.
 */
export function updateProfileMeta(
  id: string,
  patch: { name?: string; gym?: string; role?: ProfileRole },
): boolean {
  const registry = readRegistry()
  const meta = registry.profiles.find((p) => p.id === id)
  if (!meta) return false
  if (patch.name !== undefined) {
    const trimmed = patch.name.trim()
    if (trimmed) meta.name = trimmed
  }
  if (patch.gym !== undefined) {
    const trimmed = patch.gym.trim()
    if (trimmed) {
      meta.gym = trimmed
      rememberGym(registry, trimmed)
    } else {
      delete meta.gym
    }
  }
  if (patch.role !== undefined) {
    if (patch.role === 'member') delete meta.role
    else meta.role = patch.role
  }
  writeRegistry(registry)
  return true
}

/** Renames a gym in the catalogue and on every profile pointing at it. */
export function renameGymEverywhere(from: string, to: string): void {
  const target = to.trim()
  if (!target) return
  const key = from.trim().toLowerCase()
  const registry = readRegistry()
  registry.gyms = (registry.gyms ?? []).filter((g) => g.toLowerCase() !== key)
  rememberGym(registry, target)
  for (const meta of registry.profiles) {
    if (meta.gym?.toLowerCase() === key) meta.gym = target
  }
  writeRegistry(registry)
}

/** Drops a gym from the catalogue and unassigns every member of it. */
export function deleteGymEverywhere(name: string): void {
  const key = name.trim().toLowerCase()
  const registry = readRegistry()
  registry.gyms = (registry.gyms ?? []).filter((g) => g.toLowerCase() !== key)
  for (const meta of registry.profiles) {
    if (meta.gym?.toLowerCase() === key) delete meta.gym
  }
  writeRegistry(registry)
}

/** Adds a gym to the device catalogue without touching any profile. */
export function addGymToCatalogue(name: string): void {
  const registry = readRegistry()
  rememberGym(registry, name)
  writeRegistry(registry)
}

/** Removes any profile and its ciphertext. Locks first if it is the active one. */
export async function deleteProfileById(id: string): Promise<void> {
  if (id === activeId) {
    await deleteActiveProfile()
    return
  }
  const registry = readRegistry()
  registry.profiles = registry.profiles.filter((p) => p.id !== id)
  if (registry.lastActiveId === id) delete registry.lastActiveId
  writeRegistry(registry)
  clearProfileRecords(id)
  localStorage.removeItem(LEGACY_BLOB_PREFIX + id)
}

/** Plaintext data from before profiles existed, offered to the first profile. */
export function legacySnapshot(): Partial<GymSnapshot> | null {
  try {
    const raw = localStorage.getItem(LEGACY_KEY)
    if (!raw) return null
    const state = (JSON.parse(raw) as { state?: Partial<GymSnapshot> }).state
    if (!state) return null
    const hasContent =
      (state.workouts?.length ?? 0) > 0 ||
      (state.plans?.length ?? 0) > 0 ||
      (state.generatedPlans?.length ?? 0) > 0 ||
      (state.bodyweight?.length ?? 0) > 0 ||
      (state.customExercises?.length ?? 0) > 0
    return hasContent ? state : null
  } catch {
    return null
  }
}

async function persistNow(): Promise<void> {
  if (!activeKey || !activeId) return
  await persistProfile(activeId, activeKey, snapshotGym(), activeCache)
}

/**
 * Reads a profile's training data, breaking an older single-blob profile into
 * rows the first time it is opened. The blob is removed only once every row
 * is written, so an interrupted migration re-runs instead of losing data.
 */
async function readSnapshot(
  id: string,
  key: CryptoKey,
): Promise<{ snapshot: GymSnapshot; cache: RecordCache }> {
  const legacy = localStorage.getItem(LEGACY_BLOB_PREFIX + id)
  if (!legacy) return loadProfileRecords(id, key)

  const stored = await decryptJson<Partial<GymSnapshot>>(key, JSON.parse(legacy) as CipherBlob)
  const snapshot: GymSnapshot = {
    ...EMPTY_SNAPSHOT,
    ...stored,
    bodyweight: withRecordIds(stored.bodyweight ?? []),
  }
  const cache = await writeAllRecords(id, key, snapshot)
  localStorage.removeItem(LEGACY_BLOB_PREFIX + id)
  return { snapshot, cache }
}

function scheduleSave(): void {
  if (saveTimer !== null) window.clearTimeout(saveTimer)
  saveTimer = window.setTimeout(() => {
    saveTimer = null
    void persistNow()
  }, 400)
}

function flushOnHide(): void {
  if (document.visibilityState === 'hidden') void persistNow()
}

/* Full page navigations can beat the 400ms debounce; pagehide is the last
   reliable moment to flush (visibilitychange alone misses some reloads). */
function flushOnPageHide(): void {
  void persistNow()
}

function bindAutosave(): void {
  unsubscribe?.()
  unsubscribe = useGym.subscribe(scheduleSave)
  document.addEventListener('visibilitychange', flushOnHide)
  window.addEventListener('pagehide', flushOnPageHide)
}

async function startSession(
  id: string,
  key: CryptoKey,
  data: Partial<GymSnapshot>,
  cache: RecordCache,
): Promise<void> {
  activeKey = key
  activeId = id
  activeCache = cache
  hydrateGym(data)
  bindAutosave()
  const registry = readRegistry()
  registry.lastActiveId = id
  writeRegistry(registry)
  try {
    sessionStorage.setItem(SESSION_ID_KEY, id)
    sessionStorage.setItem(SESSION_RAW_KEY, await exportKeyBase64(key))
  } catch {
    // Private mode: a refresh will ask for the passphrase again.
  }
}

export async function createProfile(
  name: string,
  passphrase: string,
  options?: { importLegacy?: boolean; gym?: string; role?: ProfileRole },
): Promise<void> {
  const salt = randomBytes(16)
  const key = await deriveKey(passphrase, salt, KDF_ITERATIONS)
  const gym = options?.gym?.trim()
  /* The gate only creates members. Whoever sets up a fresh device becomes its
     administrator; every later role change happens in the admin panel, so gym
     and admin cannot be self-assigned at the door. */
  const role = options?.role ?? (readRegistry().profiles.length === 0 ? 'admin' : undefined)
  const meta: ProfileMeta = {
    id: `profile-${Date.now()}-${toBase64(randomBytes(6)).replace(/[^a-zA-Z0-9]/g, '')}`,
    name: name.trim(),
    ...(gym ? { gym } : {}),
    ...(role && role !== 'member' ? { role } : {}),
    createdAt: new Date().toISOString(),
    kdf: { salt: toBase64(salt), iterations: KDF_ITERATIONS },
    check: await encryptJson(key, SENTINEL),
  }

  const imported = options?.importLegacy ? (legacySnapshot() ?? EMPTY_SNAPSHOT) : EMPTY_SNAPSHOT
  const data: GymSnapshot = {
    ...EMPTY_SNAPSHOT,
    ...imported,
    bodyweight: withRecordIds(imported.bodyweight ?? []),
  }
  const cache = await writeAllRecords(meta.id, key, data)

  const registry = readRegistry()
  registry.profiles.push(meta)
  rememberGym(registry, gym)
  writeRegistry(registry)

  if (options?.importLegacy) localStorage.removeItem(LEGACY_KEY)
  await startSession(meta.id, key, data, cache)
}

/** Resolves false on a wrong passphrase; throws only on storage corruption. */
export async function unlockProfile(id: string, passphrase: string): Promise<boolean> {
  const meta = readRegistry().profiles.find((p) => p.id === id)
  if (!meta) return false
  const derived = await deriveKey(passphrase, fromBase64(meta.kdf.salt), meta.kdf.iterations)
  let key = derived
  if (meta.wrap) {
    /* Synced profile: the secret derives a KEK that unwraps the data key. */
    try {
      key = await importKeyBase64(await decryptJson<string>(derived, meta.wrap))
    } catch {
      return false
    }
  }
  try {
    await decryptJson<string>(key, meta.check)
  } catch {
    return false
  }
  const { snapshot, cache } = await readSnapshot(id, key)
  await startSession(id, key, snapshot, cache)
  return true
}

/** Restores the session after a refresh, using the tab-scoped key mirror. */
export async function resumeSession(): Promise<boolean> {
  try {
    const id = sessionStorage.getItem(SESSION_ID_KEY)
    const raw = sessionStorage.getItem(SESSION_RAW_KEY)
    if (!id || !raw) return false
    if (!readRegistry().profiles.some((p) => p.id === id)) return false
    const key = await importKeyBase64(raw)
    const { snapshot, cache } = await readSnapshot(id, key)
    activeKey = key
    activeId = id
    activeCache = cache
    hydrateGym(snapshot)
    bindAutosave()
    return true
  } catch {
    return false
  }
}

export async function lockProfile(): Promise<void> {
  if (saveTimer !== null) {
    window.clearTimeout(saveTimer)
    saveTimer = null
  }
  await persistNow()
  unsubscribe?.()
  unsubscribe = null
  document.removeEventListener('visibilitychange', flushOnHide)
  window.removeEventListener('pagehide', flushOnPageHide)
  activeKey = null
  activeId = null
  activeCache = emptyCache()
  hydrateGym(EMPTY_SNAPSHOT)
  try {
    sessionStorage.removeItem(SESSION_ID_KEY)
    sessionStorage.removeItem(SESSION_RAW_KEY)
  } catch {
    // Nothing to clear in private mode.
  }
}

/* ------------------------------------------------------------------------ */
/* Sync hooks. The engine in sync.ts moves ciphertext envelopes; these are    */
/* the few controlled touches it needs on the live session and the registry. */

/** Flushes pending edits to disk so sync pushes what the user actually sees. */
export async function flushActiveProfile(): Promise<void> {
  await persistNow()
}

/** The unlocked profile's key, for wrapping under a recovery code. */
export function activeProfileKey(): CryptoKey | null {
  return activeKey
}

/** The KDF material a new device needs to derive this profile's key. */
export function profileCrypto(
  id: string,
): { salt: string; iterations: number; check: CipherBlob } | null {
  const meta = readRegistry().profiles.find((p) => p.id === id)
  return meta ? { salt: meta.kdf.salt, iterations: meta.kdf.iterations, check: meta.check } : null
}

/**
 * Moves the active profile onto an account's crypto identity: local rows are
 * re-encrypted under the account key so every linked device decrypts every
 * row, and the registry keeps the account's salt and sentinel so the same
 * passphrase keeps opening this profile here.
 */
export async function adoptRemoteIdentity(
  id: string,
  remote: { salt: string; iterations: number; check: CipherBlob; wrap?: CipherBlob },
  key: CryptoKey,
): Promise<void> {
  if (id !== activeId || !activeKey) throw new Error('profile must be unlocked')
  await persistNow()
  await reencryptProfileRecords(id, activeKey, key)

  const registry = readRegistry()
  const meta = registry.profiles.find((p) => p.id === id)
  if (!meta) throw new Error('profile missing from registry')
  meta.kdf = { salt: remote.salt, iterations: remote.iterations }
  meta.check = remote.check
  if (remote.wrap) meta.wrap = remote.wrap
  else delete meta.wrap
  writeRegistry(registry)

  activeKey = key
  activeCache = emptyCache()
  const { snapshot, cache } = await loadProfileRecords(id, key)
  activeCache = cache
  hydrateGym(snapshot)
  try {
    sessionStorage.setItem(SESSION_RAW_KEY, await exportKeyBase64(key))
  } catch {
    // Private mode: a refresh will ask for the passphrase again.
  }
}

/**
 * A profile born from a sync account: it starts empty and already carries the
 * account's salt and sentinel, so the same passphrase opens it here and the
 * pulled rows decrypt without any re-encryption. This is the second device's
 * one-step sign-in.
 */
export async function createLinkedProfile(
  name: string,
  remote: { salt: string; iterations: number; check: CipherBlob; wrap?: CipherBlob },
  key: CryptoKey,
): Promise<string> {
  const meta: ProfileMeta = {
    id: `profile-${Date.now()}-${toBase64(randomBytes(6)).replace(/[^a-zA-Z0-9]/g, '')}`,
    name: name.trim() || 'Me',
    createdAt: new Date().toISOString(),
    kdf: { salt: remote.salt, iterations: remote.iterations },
    check: remote.check,
    ...(remote.wrap ? { wrap: remote.wrap } : {}),
  }
  const cache = await writeAllRecords(meta.id, key, EMPTY_SNAPSHOT)

  const registry = readRegistry()
  registry.profiles.push(meta)
  writeRegistry(registry)

  await startSession(meta.id, key, EMPTY_SNAPSHOT, cache)
  return meta.id
}

/**
 * Re-reads the active profile's rows after sync applied remote writes. The
 * in-flight session stays device-local on disk, so a mid-workout pull cannot
 * clobber the set being logged.
 */
export async function reloadActiveFromDisk(): Promise<void> {
  if (!activeKey || !activeId) return
  const { snapshot, cache } = await loadProfileRecords(activeId, activeKey)
  /* A set logged while sync ran lives only in memory; memory wins that race
     and the next autosave writes it back to disk. */
  const inFlight = snapshotGym().activeWorkout
  activeCache = cache
  hydrateGym({ ...snapshot, activeWorkout: inFlight ?? snapshot.activeWorkout })
}

/** Deletes the active profile and every byte of its data. Cannot be undone. */
export async function deleteActiveProfile(): Promise<void> {
  if (!activeId) return
  const id = activeId
  const registry = readRegistry()
  registry.profiles = registry.profiles.filter((p) => p.id !== id)
  if (registry.lastActiveId === id) delete registry.lastActiveId
  writeRegistry(registry)
  clearProfileRecords(id)
  localStorage.removeItem(LEGACY_BLOB_PREFIX + id)
  await lockProfile()
}
