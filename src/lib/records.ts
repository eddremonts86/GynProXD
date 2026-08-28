import type { ActiveChallenge } from './challenge'
import type { FitnessTestResult } from './fitness-test'
import type { StoryProgress } from './story'
import type {
  BodyweightEntry,
  Exercise,
  GeneratedPlan,
  ProfileDetails,
  WeeklyPlan,
  Workout,
} from './types'
import type { GymSnapshot } from '../store/useGym'

/**
 * The training data as individually addressable rows.
 *
 * The store keeps arrays and storage kept one encrypted blob. That is fine
 * for one device and destroys data on two: train on the phone, open the
 * laptop holding a stale copy, it saves the whole blob, the session is gone.
 * A row is one workout, one plan, one weigh-in, identified and timestamped on
 * its own, so a merge can take what actually changed.
 *
 * Sync metadata lives here rather than on the domain types: the store stays a
 * plain training model and no reducer has to remember to touch an updatedAt.
 */

export const COLLECTIONS = [
  'workouts',
  'bodyweight',
  'plans',
  'generatedPlans',
  'customExercises',
  'challenges',
  'profileDetails',
  'fitnessTest',
  'story',
] as const

export type Collection = (typeof COLLECTIONS)[number]

/** Collections holding exactly one value, addressed under a fixed id. */
export const SINGLETON_ID = 'self'

/**
 * How each collection reads in the UI, which is also how it is rebuilt from
 * rows. Live order and reloaded order must agree, or a refresh would quietly
 * reshuffle someone's history.
 */
export const ORDER: Record<Collection, 'newest-first' | 'oldest-first' | 'single'> = {
  workouts: 'newest-first',
  bodyweight: 'newest-first',
  plans: 'newest-first',
  generatedPlans: 'newest-first',
  challenges: 'newest-first',
  customExercises: 'oldest-first',
  profileDetails: 'single',
  fitnessTest: 'single',
  story: 'single',
}

export interface RecordMeta {
  id: string
  collection: Collection
  /** When this device first stored the row. Breaks ties in the rebuilt order. */
  createdAt: string
  updatedAt: string
  /** Set instead of dropping the row, so a delete can reach other devices. */
  deletedAt?: string
}

/** A row as the store currently holds it, before any of it is written. */
export interface LiveRecord {
  collection: Collection
  id: string
  value: unknown
}

/** What was last written, kept in memory so a save only touches what moved. */
export interface CachedRecord {
  meta: RecordMeta
  json: string
}

export interface LoadedRecord {
  meta: RecordMeta
  value: unknown
}

export interface RecordWrite {
  meta: RecordMeta
  value: unknown
  json: string
}

export interface RecordDiff {
  writes: RecordWrite[]
  tombstones: RecordMeta[]
}

export function recordKey(collection: Collection, id: string): string {
  return `${collection}/${id}`
}

/** Weigh-ins predate row ids. Derived from position, so a reload is stable. */
export function bodyweightRecordId(entry: BodyweightEntry, index: number): string {
  return entry.id ?? `bw-${entry.date}-${index}`
}

/** Backfills row ids on weigh-ins stored before rows existed. */
export function withRecordIds(bodyweight: BodyweightEntry[]): BodyweightEntry[] {
  if (bodyweight.every((entry) => entry.id)) return bodyweight
  return bodyweight.map((entry, index) =>
    entry.id ? entry : { ...entry, id: bodyweightRecordId(entry, index) },
  )
}

/**
 * Explodes the store's arrays into rows, each collection in its live order.
 * activeWorkout is deliberately absent: a session in progress belongs to the
 * phone in your hand and must never be overwritten by another device.
 */
export function recordsFromSnapshot(snapshot: GymSnapshot): LiveRecord[] {
  const rows: LiveRecord[] = []
  for (const workout of snapshot.workouts)
    rows.push({ collection: 'workouts', id: workout.id, value: workout })
  snapshot.bodyweight.forEach((entry, index) =>
    rows.push({ collection: 'bodyweight', id: bodyweightRecordId(entry, index), value: entry }),
  )
  for (const plan of snapshot.plans) rows.push({ collection: 'plans', id: plan.id, value: plan })
  for (const plan of snapshot.generatedPlans)
    rows.push({ collection: 'generatedPlans', id: plan.id, value: plan })
  for (const exercise of snapshot.customExercises)
    rows.push({ collection: 'customExercises', id: exercise.id, value: exercise })
  for (const active of snapshot.challenges)
    rows.push({ collection: 'challenges', id: active.challenge.id, value: active })
  if (snapshot.profileDetails)
    rows.push({ collection: 'profileDetails', id: SINGLETON_ID, value: snapshot.profileDetails })
  if (snapshot.fitnessTest)
    rows.push({ collection: 'fitnessTest', id: SINGLETON_ID, value: snapshot.fitnessTest })
  if (snapshot.story) rows.push({ collection: 'story', id: SINGLETON_ID, value: snapshot.story })
  return rows
}

/**
 * Stamps rows as if the whole snapshot were being stored at once, staggering
 * createdAt by position so the rebuilt order matches the order the arrays
 * already had. Storing a profile and rebuilding it must be a round trip.
 */
export function stampRecords(rows: readonly LiveRecord[], at: number): LoadedRecord[] {
  const positions = new Map<Collection, number>()
  return rows.map((row) => {
    const position = positions.get(row.collection) ?? 0
    positions.set(row.collection, position + 1)
    const stamp = new Date(
      at + (ORDER[row.collection] === 'newest-first' ? -position : position),
    ).toISOString()
    return {
      meta: { id: row.id, collection: row.collection, createdAt: stamp, updatedAt: stamp },
      value: row.value,
    }
  })
}

function byCollection(records: readonly LoadedRecord[]): Map<Collection, LoadedRecord[]> {
  const grouped = new Map<Collection, LoadedRecord[]>()
  for (const record of records) {
    if (record.meta.deletedAt) continue
    const rows = grouped.get(record.meta.collection)
    if (rows) rows.push(record)
    else grouped.set(record.meta.collection, [record])
  }
  return grouped
}

/* Domain time first, then when the row was stored, then the id. The last two
   only ever decide ties, but they decide them the same way every load. */
function newestFirst<T>(rows: LoadedRecord[], keyOf: (value: T) => string): T[] {
  return rows
    .slice()
    .sort((a, b) => {
      const domain = keyOf(b.value as T).localeCompare(keyOf(a.value as T))
      if (domain !== 0) return domain
      const stored = b.meta.createdAt.localeCompare(a.meta.createdAt)
      return stored !== 0 ? stored : b.meta.id.localeCompare(a.meta.id)
    })
    .map((row) => row.value as T)
}

function oldestFirst<T>(rows: LoadedRecord[]): T[] {
  return rows
    .slice()
    .sort(
      (a, b) =>
        a.meta.createdAt.localeCompare(b.meta.createdAt) || a.meta.id.localeCompare(b.meta.id),
    )
    .map((row) => row.value as T)
}

function single<T>(rows: LoadedRecord[]): T | null {
  return rows.length > 0 ? (rows[0].value as T) : null
}

/** Rebuilds the store's shape from rows. activeWorkout is loaded separately. */
export function snapshotFromRecords(records: readonly LoadedRecord[]): GymSnapshot {
  const grouped = byCollection(records)
  const rows = (collection: Collection) => grouped.get(collection) ?? []
  return {
    workouts: newestFirst<Workout>(rows('workouts'), (w) => w.startedAt ?? w.date),
    bodyweight: newestFirst<BodyweightEntry>(rows('bodyweight'), (b) => b.date),
    plans: newestFirst<WeeklyPlan>(rows('plans'), (p) => p.createdAt),
    generatedPlans: newestFirst<GeneratedPlan>(rows('generatedPlans'), (p) => p.createdAt),
    challenges: newestFirst<ActiveChallenge>(rows('challenges'), (c) => c.startedAt),
    customExercises: oldestFirst<Exercise>(rows('customExercises')),
    profileDetails: single<ProfileDetails>(rows('profileDetails')),
    fitnessTest: single<FitnessTestResult>(rows('fitnessTest')),
    story: single<StoryProgress>(rows('story')),
    activeWorkout: null,
  }
}

/**
 * What changed since the last write. A row whose content is byte-identical is
 * left alone, so its updatedAt keeps meaning "when this actually changed"
 * rather than "when the app last saved anything".
 */
export function diffRecords(
  previous: ReadonlyMap<string, CachedRecord>,
  live: readonly LiveRecord[],
  now: string,
): RecordDiff {
  const writes: RecordWrite[] = []
  const present = new Set<string>()

  for (const row of live) {
    const key = recordKey(row.collection, row.id)
    present.add(key)
    const json = JSON.stringify(row.value)
    const cached = previous.get(key)
    if (cached && !cached.meta.deletedAt && cached.json === json) continue
    writes.push({
      meta: {
        id: row.id,
        collection: row.collection,
        createdAt: cached?.meta.createdAt ?? now,
        updatedAt: now,
      },
      value: row.value,
      json,
    })
  }

  const tombstones: RecordMeta[] = []
  for (const [key, cached] of previous) {
    if (present.has(key) || cached.meta.deletedAt) continue
    tombstones.push({ ...cached.meta, updatedAt: now, deletedAt: now })
  }

  return { writes, tombstones }
}

/**
 * Tombstones cannot be kept forever. Dropping them means a device that stayed
 * offline longer than this would resurrect the deleted row; that is the usual
 * trade, and the window is far wider than anyone's holiday.
 */
export function isExpiredTombstone(meta: RecordMeta, now: number, days: number): boolean {
  if (!meta.deletedAt) return false
  const at = Date.parse(meta.deletedAt)
  return Number.isFinite(at) && now - at > days * 86_400_000
}
