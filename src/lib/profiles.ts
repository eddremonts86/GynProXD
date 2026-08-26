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
}

interface Registry {
  profiles: ProfileMeta[]
  lastActiveId?: string
  /** Device-wide gym catalogue, so new profiles can pick an existing one. */
  gyms?: string[]
}

const REGISTRY_KEY = 'forma-profiles'
const DATA_PREFIX = 'forma-data-'
const LEGACY_KEY = 'gynproxd-v2'
const SESSION_ID_KEY = 'forma-session-profile'
const SESSION_RAW_KEY = 'forma-session-key'
const SENTINEL = 'forma'

let activeKey: CryptoKey | null = null
let activeId: string | null = null
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
  localStorage.removeItem(DATA_PREFIX + id)
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
  const blob = await encryptJson(activeKey, snapshotGym())
  localStorage.setItem(DATA_PREFIX + activeId, JSON.stringify(blob))
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

function bindAutosave(): void {
  unsubscribe?.()
  unsubscribe = useGym.subscribe(scheduleSave)
  document.addEventListener('visibilitychange', flushOnHide)
}

async function startSession(id: string, key: CryptoKey, data: Partial<GymSnapshot>): Promise<void> {
  activeKey = key
  activeId = id
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
  const role = options?.role
  const meta: ProfileMeta = {
    id: `profile-${Date.now()}-${toBase64(randomBytes(6)).replace(/[^a-zA-Z0-9]/g, '')}`,
    name: name.trim(),
    ...(gym ? { gym } : {}),
    ...(role && role !== 'member' ? { role } : {}),
    createdAt: new Date().toISOString(),
    kdf: { salt: toBase64(salt), iterations: KDF_ITERATIONS },
    check: await encryptJson(key, SENTINEL),
  }

  const data: Partial<GymSnapshot> =
    options?.importLegacy ? (legacySnapshot() ?? EMPTY_SNAPSHOT) : EMPTY_SNAPSHOT
  const blob = await encryptJson(key, { ...EMPTY_SNAPSHOT, ...data })
  localStorage.setItem(DATA_PREFIX + meta.id, JSON.stringify(blob))

  const registry = readRegistry()
  registry.profiles.push(meta)
  rememberGym(registry, gym)
  writeRegistry(registry)

  if (options?.importLegacy) localStorage.removeItem(LEGACY_KEY)
  await startSession(meta.id, key, data)
}

/** Resolves false on a wrong passphrase; throws only on storage corruption. */
export async function unlockProfile(id: string, passphrase: string): Promise<boolean> {
  const meta = readRegistry().profiles.find((p) => p.id === id)
  if (!meta) return false
  const key = await deriveKey(passphrase, fromBase64(meta.kdf.salt), meta.kdf.iterations)
  try {
    await decryptJson<string>(key, meta.check)
  } catch {
    return false
  }
  const raw = localStorage.getItem(DATA_PREFIX + id)
  const data = raw
    ? await decryptJson<GymSnapshot>(key, JSON.parse(raw) as CipherBlob)
    : EMPTY_SNAPSHOT
  await startSession(id, key, data)
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
    const stored = localStorage.getItem(DATA_PREFIX + id)
    const data = stored
      ? await decryptJson<GymSnapshot>(key, JSON.parse(stored) as CipherBlob)
      : EMPTY_SNAPSHOT
    activeKey = key
    activeId = id
    hydrateGym(data)
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
  activeKey = null
  activeId = null
  hydrateGym(EMPTY_SNAPSHOT)
  try {
    sessionStorage.removeItem(SESSION_ID_KEY)
    sessionStorage.removeItem(SESSION_RAW_KEY)
  } catch {
    // Nothing to clear in private mode.
  }
}

/** Deletes the active profile and every byte of its data. Cannot be undone. */
export async function deleteActiveProfile(): Promise<void> {
  if (!activeId) return
  const id = activeId
  const registry = readRegistry()
  registry.profiles = registry.profiles.filter((p) => p.id !== id)
  if (registry.lastActiveId === id) delete registry.lastActiveId
  writeRegistry(registry)
  localStorage.removeItem(DATA_PREFIX + id)
  await lockProfile()
}
