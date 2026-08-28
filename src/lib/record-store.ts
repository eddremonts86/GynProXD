import { decryptJson, encryptJson, type CipherBlob } from './crypto'
import {
  diffRecords,
  isExpiredTombstone,
  recordKey,
  recordsFromSnapshot,
  snapshotFromRecords,
  stampRecords,
  type CachedRecord,
  type Collection,
  type LoadedRecord,
  type RecordMeta,
} from './records'
import type { Workout } from './types'
import type { GymSnapshot } from '../store/useGym'

/**
 * Rows on disk: one localStorage key per record, each body encrypted on its
 * own. Logging a set now rewrites one workout instead of re-encrypting every
 * session you have ever done, and a future sync can push exactly the rows
 * that moved.
 *
 * The envelope's metadata is plaintext by design. A server holding ciphertext
 * still needs an id and an updatedAt to merge; what it must never see is the
 * body. The cost is that timestamps leak how often someone trains, which no
 * sync design avoids.
 */

const RECORD_PREFIX = 'forma-rec-'
const ACTIVE_PREFIX = 'forma-active-'
const TOMBSTONE_DAYS = 90

interface Envelope extends RecordMeta {
  /** Envelope version, so a later shape change is detectable rather than fatal. */
  v: 1
  /** Absent on tombstones: a deleted row keeps its metadata and loses its body. */
  blob?: CipherBlob
}

/** What was last written, so a save only touches rows that actually changed. */
export interface RecordCache {
  records: Map<string, CachedRecord>
  active: string
}

export function emptyCache(): RecordCache {
  return { records: new Map(), active: '' }
}

function storageKey(profileId: string, collection: Collection, id: string): string {
  return `${RECORD_PREFIX}${profileId}-${collection}-${id}`
}

function activeStorageKey(profileId: string): string {
  return `${ACTIVE_PREFIX}${profileId}`
}

/* Keys are never parsed back: the envelope carries its own id and collection,
   so an exercise id with dashes in it cannot confuse the loader. */
function envelopeKeys(profileId: string): string[] {
  const prefix = `${RECORD_PREFIX}${profileId}-`
  const keys: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key?.startsWith(prefix)) keys.push(key)
  }
  return keys
}

function metaOf(envelope: Envelope): RecordMeta {
  return {
    id: envelope.id,
    collection: envelope.collection,
    createdAt: envelope.createdAt,
    updatedAt: envelope.updatedAt,
    ...(envelope.deletedAt ? { deletedAt: envelope.deletedAt } : {}),
  }
}

function writeEnvelope(profileId: string, meta: RecordMeta, blob?: CipherBlob): void {
  const envelope: Envelope = { v: 1, ...meta, ...(blob ? { blob } : {}) }
  localStorage.setItem(storageKey(profileId, meta.collection, meta.id), JSON.stringify(envelope))
}

/**
 * The session in progress is device-local and never becomes a row: it belongs
 * to the phone in your hand, and a laptop syncing its own idea of "active"
 * would wipe a workout mid-set.
 */
async function readActiveWorkout(profileId: string, key: CryptoKey): Promise<Workout | null> {
  const raw = localStorage.getItem(activeStorageKey(profileId))
  if (!raw) return null
  try {
    return await decryptJson<Workout>(key, JSON.parse(raw) as CipherBlob)
  } catch {
    return null
  }
}

async function writeActiveWorkout(
  profileId: string,
  key: CryptoKey,
  workout: Workout | null,
  cache: RecordCache,
): Promise<void> {
  const json = JSON.stringify(workout)
  if (json === cache.active) return
  try {
    if (workout) {
      const blob = await encryptJson(key, workout)
      localStorage.setItem(activeStorageKey(profileId), JSON.stringify(blob))
    } else {
      localStorage.removeItem(activeStorageKey(profileId))
    }
    cache.active = json
  } catch {
    /* Leave the cache alone so the next save tries again. */
  }
}

export async function loadProfileRecords(
  profileId: string,
  key: CryptoKey,
): Promise<{ snapshot: GymSnapshot; cache: RecordCache }> {
  const cache = emptyCache()
  const loaded: LoadedRecord[] = []
  const now = Date.now()

  await Promise.all(
    envelopeKeys(profileId).map(async (localKey) => {
      const raw = localStorage.getItem(localKey)
      if (!raw) return
      let envelope: Envelope
      try {
        envelope = JSON.parse(raw) as Envelope
      } catch {
        return
      }
      if (!envelope?.id || !envelope.collection) return
      const meta = metaOf(envelope)

      if (meta.deletedAt) {
        if (isExpiredTombstone(meta, now, TOMBSTONE_DAYS)) localStorage.removeItem(localKey)
        else cache.records.set(recordKey(meta.collection, meta.id), { meta, json: '' })
        return
      }
      if (!envelope.blob) return

      try {
        const value = await decryptJson<unknown>(key, envelope.blob)
        cache.records.set(recordKey(meta.collection, meta.id), {
          meta,
          json: JSON.stringify(value),
        })
        loaded.push({ meta, value })
      } catch {
        /* Wrong key or a corrupt row: skip it rather than delete someone's data. */
      }
    }),
  )

  const snapshot = snapshotFromRecords(loaded)
  snapshot.activeWorkout = await readActiveWorkout(profileId, key)
  cache.active = JSON.stringify(snapshot.activeWorkout)
  return { snapshot, cache }
}

export async function persistProfile(
  profileId: string,
  key: CryptoKey,
  snapshot: GymSnapshot,
  cache: RecordCache,
): Promise<void> {
  const now = new Date().toISOString()
  const { writes, tombstones } = diffRecords(cache.records, recordsFromSnapshot(snapshot), now)

  for (const write of writes) {
    try {
      writeEnvelope(profileId, write.meta, await encryptJson(key, write.value))
      cache.records.set(recordKey(write.meta.collection, write.meta.id), {
        meta: write.meta,
        json: write.json,
      })
    } catch {
      /* Quota or a bad row: leave the cache untouched so the next save retries. */
    }
  }

  for (const meta of tombstones) {
    try {
      writeEnvelope(profileId, meta)
      cache.records.set(recordKey(meta.collection, meta.id), { meta, json: '' })
    } catch {
      /* Same: a failed tombstone is retried, never silently forgotten. */
    }
  }

  await writeActiveWorkout(profileId, key, snapshot.activeWorkout, cache)
}

/**
 * Writes a whole snapshot as rows, for a new profile and for one stored as a
 * single blob before rows existed. createdAt is staggered by position so the
 * rebuilt order matches the order the arrays already had: nobody's history
 * gets reshuffled by the migration.
 */
export async function writeAllRecords(
  profileId: string,
  key: CryptoKey,
  snapshot: GymSnapshot,
  at = Date.now(),
): Promise<RecordCache> {
  const cache = emptyCache()

  for (const { meta, value } of stampRecords(recordsFromSnapshot(snapshot), at)) {
    writeEnvelope(profileId, meta, await encryptJson(key, value))
    cache.records.set(recordKey(meta.collection, meta.id), { meta, json: JSON.stringify(value) })
  }

  await writeActiveWorkout(profileId, key, snapshot.activeWorkout, cache)
  return cache
}

/** Every byte of a profile's training data. Used when a profile is deleted. */
export function clearProfileRecords(profileId: string): void {
  for (const key of envelopeKeys(profileId)) localStorage.removeItem(key)
  localStorage.removeItem(activeStorageKey(profileId))
}

/** A row as sync moves it: plaintext metadata, body still ciphertext. */
export interface EnvelopeRow {
  meta: RecordMeta
  blob?: CipherBlob
}

/**
 * Every envelope on disk, ciphertext untouched. Sync pushes these as they
 * are: the server needs the metadata to merge and must never see the body.
 */
export function listEnvelopes(profileId: string): EnvelopeRow[] {
  const rows: EnvelopeRow[] = []
  for (const localKey of envelopeKeys(profileId)) {
    const raw = localStorage.getItem(localKey)
    if (!raw) continue
    try {
      const envelope = JSON.parse(raw) as Envelope
      if (!envelope?.id || !envelope.collection) continue
      rows.push({ meta: metaOf(envelope), ...(envelope.blob ? { blob: envelope.blob } : {}) })
    } catch {
      /* An unreadable envelope is a local problem; sync skips it. */
    }
  }
  return rows
}

/** Writes a row another device won. The caller has already decided the merge. */
export function writeRemoteEnvelope(profileId: string, row: EnvelopeRow): void {
  writeEnvelope(profileId, row.meta, row.blob)
}

/**
 * Re-encrypts every row body under a new key, metadata untouched. Used when a
 * profile joins an account whose data lives under a different passphrase: the
 * local rows move to that key so both devices decrypt one another.
 */
export async function reencryptProfileRecords(
  profileId: string,
  oldKey: CryptoKey,
  newKey: CryptoKey,
): Promise<void> {
  for (const row of listEnvelopes(profileId)) {
    if (!row.blob) continue
    try {
      const value = await decryptJson<unknown>(oldKey, row.blob)
      writeEnvelope(profileId, row.meta, await encryptJson(newKey, value))
    } catch {
      /* A row the old key cannot read cannot be carried over; leave it. */
    }
  }
  const rawActive = localStorage.getItem(activeStorageKey(profileId))
  if (rawActive) {
    try {
      const active = await decryptJson<Workout>(oldKey, JSON.parse(rawActive) as CipherBlob)
      localStorage.setItem(
        activeStorageKey(profileId),
        JSON.stringify(await encryptJson(newKey, active)),
      )
    } catch {
      localStorage.removeItem(activeStorageKey(profileId))
    }
  }
}
