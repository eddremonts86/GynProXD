import { describe, expect, it } from 'vitest'
import {
  diffRecords,
  isExpiredTombstone,
  recordKey,
  recordsFromSnapshot,
  snapshotFromRecords,
  stampRecords,
  withRecordIds,
  type CachedRecord,
  type LiveRecord,
} from './records'
import { EMPTY_SNAPSHOT, hydrateGym, snapshotGym, useGym, type GymSnapshot } from '../store/useGym'
import type { Workout } from './types'

function workout(id: string, startedAt: string): Workout {
  return {
    id,
    date: startedAt.slice(0, 10),
    startedAt,
    exercises: [{ exerciseId: 'bench', sets: [{ weight: 60, reps: 8 }] }],
  }
}

/** Stores a snapshot and reads it straight back, the way a reload does. */
function roundTrip(snapshot: GymSnapshot, at = Date.parse('2026-08-28T10:00:00.000Z')): GymSnapshot {
  return snapshotFromRecords(stampRecords(recordsFromSnapshot(snapshot), at))
}

describe('recordsFromSnapshot', () => {
  it('leaves the session in progress out: it belongs to one device', () => {
    const rows = recordsFromSnapshot({
      ...EMPTY_SNAPSHOT,
      activeWorkout: workout('live', '2026-08-28T09:00:00.000Z'),
      workouts: [workout('done', '2026-08-27T09:00:00.000Z')],
    })
    expect(rows.map((r) => r.id)).toEqual(['done'])
  })

  it('addresses the one-of-a-kind collections under a fixed id', () => {
    const rows = recordsFromSnapshot({
      ...EMPTY_SNAPSHOT,
      story: { programId: 'treeline', startedAt: '2026-08-01', completedDays: [1, 2] },
    })
    expect(rows).toEqual([
      {
        collection: 'story',
        id: 'self',
        value: { programId: 'treeline', startedAt: '2026-08-01', completedDays: [1, 2] },
      },
    ])
  })
})

describe('the life profile', () => {
  it('round-trips through a store and back', () => {
    // It is a singleton like `story` and it carries a list inside it, which is
    // the combination worth checking: an array nested in a single row does not
    // get the per-row merge the top-level collections do, so it has to survive
    // as one value or not at all.
    hydrateGym(EMPTY_SNAPSHOT)
    const store = useGym.getState()
    store.updateLifeProfile({ wake: '06:30', sleep: '22:30' })
    useGym.getState().saveAnchor({
      id: 'work',
      label: 'work',
      days: ['mon', 'tue', 'wed', 'thu', 'fri'],
      start: '09:00',
      end: '17:00',
      kind: 'work',
    })
    useGym.getState().saveAnchor({
      id: 'school',
      label: 'school run',
      days: ['mon', 'fri'],
      start: '08:15',
      end: '08:45',
      kind: 'care',
    })

    const live = snapshotGym()
    const rebuilt = roundTrip(live)
    expect(rebuilt.lifeProfile).toEqual(live.lifeProfile)
    expect(rebuilt.lifeProfile?.anchors.map((a) => a.id)).toEqual(['work', 'school'])
    expect(rebuilt.lifeProfile?.wake).toBe('06:30')
  })

  it('edits an anchor in place rather than adding a second one', () => {
    hydrateGym(EMPTY_SNAPSHOT)
    const anchor = {
      id: 'work',
      label: 'work',
      days: ['mon' as const],
      start: '09:00',
      end: '17:00',
      kind: 'work' as const,
    }
    useGym.getState().saveAnchor(anchor)
    useGym.getState().saveAnchor({ ...anchor, end: '15:00' })
    expect(useGym.getState().lifeProfile?.anchors).toEqual([{ ...anchor, end: '15:00' }])
  })

  it('prunes what is past and refuses a duplicate on import', () => {
    // The profile is one synced row with arrays inside it, so the pruning is a
    // fact about the record rather than about a screen. Yesterday's meetings
    // are weight it should not carry on every sync for the life of the account.
    hydrateGym(EMPTY_SNAPSHOT)
    const block = (date: string, start: string) => ({
      date,
      start,
      end: '15:00',
      source: 'ics' as const,
    })
    const added = useGym.getState().importBusy(
      [block('2026-09-01', '14:00'), block('2026-09-20', '14:00'), block('2026-09-21', '09:00')],
      '2026-09-10',
    )
    expect(added).toBe(2)
    expect(useGym.getState().lifeProfile?.busy?.map((b) => b.date)).toEqual([
      '2026-09-20',
      '2026-09-21',
    ])

    /* The same file again adds nothing, which is what makes importing twice
       harmless rather than doubling somebody's week. */
    expect(useGym.getState().importBusy([block('2026-09-20', '14:00')], '2026-09-10')).toBe(0)
    expect(useGym.getState().lifeProfile?.busy).toHaveLength(2)
  })

  it('drops the imported blocks on request and keeps the anchors', () => {
    hydrateGym(EMPTY_SNAPSHOT)
    useGym.getState().addAnchor({
      label: 'work',
      days: ['mon'],
      start: '09:00',
      end: '17:00',
      kind: 'work',
    })
    useGym
      .getState()
      .importBusy([{ date: '2026-09-20', start: '14:00', end: '15:00', source: 'ics' }], '2026-09-10')
    useGym.getState().clearBusy()
    expect(useGym.getState().lifeProfile?.busy).toEqual([])
    expect(useGym.getState().lifeProfile?.anchors).toHaveLength(1)
  })

  it('is absent from the rows until somebody fills it in', () => {
    // An empty singleton must not become a row, or every profile on the server
    // grows one the moment this code ships.
    expect(recordsFromSnapshot(EMPTY_SNAPSHOT)).toEqual([])
  })
})

describe('snapshotFromRecords', () => {
  it('rebuilds every collection in the order the app already showed', () => {
    const snapshot: GymSnapshot = {
      ...EMPTY_SNAPSHOT,
      workouts: [
        workout('w3', '2026-08-27T18:00:00.000Z'),
        workout('w2', '2026-08-25T18:00:00.000Z'),
        workout('w1', '2026-08-20T18:00:00.000Z'),
      ],
      bodyweight: [
        { id: 'b2', date: '2026-08-27', kg: 81 },
        { id: 'b1', date: '2026-08-20', kg: 82 },
      ],
      plans: [
        { id: 'p2', name: 'New', days: [], createdAt: '2026-08-26T00:00:00.000Z' },
        { id: 'p1', name: 'Old', days: [], createdAt: '2026-08-01T00:00:00.000Z' },
      ],
      customExercises: [
        { id: 'zebra-press', name: 'Zebra Press', muscle: 'shoulders', equipment: 'dumbbell' },
        { id: 'anvil-row', name: 'Anvil Row', muscle: 'back', equipment: 'barbell' },
      ],
    }
    const rebuilt = roundTrip(snapshot)
    expect(rebuilt.workouts.map((w) => w.id)).toEqual(['w3', 'w2', 'w1'])
    expect(rebuilt.bodyweight.map((b) => b.id)).toEqual(['b2', 'b1'])
    expect(rebuilt.plans.map((p) => p.id)).toEqual(['p2', 'p1'])
    /* Custom movements have no timestamp of their own, so the order they
       were added is what gets kept. */
    expect(rebuilt.customExercises.map((e) => e.id)).toEqual(['zebra-press', 'anvil-row'])
  })

  it('separates two weigh-ins on the same day by when each was stored', () => {
    const at = Date.parse('2026-08-28T10:00:00.000Z')
    const rebuilt = roundTrip(
      {
        ...EMPTY_SNAPSHOT,
        bodyweight: [
          { id: 'evening', date: '2026-08-27', kg: 81.4 },
          { id: 'morning', date: '2026-08-27', kg: 80.9 },
        ],
      },
      at,
    )
    expect(rebuilt.bodyweight.map((b) => b.id)).toEqual(['evening', 'morning'])
  })

  it('drops deleted rows and never revives them', () => {
    const rebuilt = snapshotFromRecords([
      {
        meta: {
          id: 'w1',
          collection: 'workouts',
          createdAt: '2026-08-20T00:00:00.000Z',
          updatedAt: '2026-08-21T00:00:00.000Z',
          deletedAt: '2026-08-21T00:00:00.000Z',
        },
        value: workout('w1', '2026-08-20T18:00:00.000Z'),
      },
    ])
    expect(rebuilt.workouts).toEqual([])
  })
})

describe('diffRecords', () => {
  const now = '2026-08-28T12:00:00.000Z'
  const earlier = '2026-08-01T12:00:00.000Z'

  function cache(rows: LiveRecord[], stamp: string): Map<string, CachedRecord> {
    const map = new Map<string, CachedRecord>()
    for (const row of rows) {
      map.set(recordKey(row.collection, row.id), {
        meta: { id: row.id, collection: row.collection, createdAt: stamp, updatedAt: stamp },
        json: JSON.stringify(row.value),
      })
    }
    return map
  }

  it('writes nothing when nothing changed', () => {
    const live = recordsFromSnapshot({
      ...EMPTY_SNAPSHOT,
      workouts: [workout('w1', '2026-08-20T18:00:00.000Z')],
    })
    expect(diffRecords(cache(live, earlier), live, now)).toEqual({ writes: [], tombstones: [] })
  })

  it('keeps the original createdAt and moves only updatedAt', () => {
    const before = recordsFromSnapshot({
      ...EMPTY_SNAPSHOT,
      workouts: [workout('w1', '2026-08-20T18:00:00.000Z')],
    })
    const changed = workout('w1', '2026-08-20T18:00:00.000Z')
    changed.ec = true
    const { writes } = diffRecords(
      cache(before, earlier),
      [{ collection: 'workouts', id: 'w1', value: changed }],
      now,
    )
    expect(writes).toHaveLength(1)
    expect(writes[0].meta.createdAt).toBe(earlier)
    expect(writes[0].meta.updatedAt).toBe(now)
  })

  it('turns a row that disappeared into a tombstone rather than forgetting it', () => {
    const before = recordsFromSnapshot({
      ...EMPTY_SNAPSHOT,
      workouts: [workout('w1', '2026-08-20T18:00:00.000Z')],
    })
    const { writes, tombstones } = diffRecords(cache(before, earlier), [], now)
    expect(writes).toEqual([])
    expect(tombstones).toEqual([
      {
        id: 'w1',
        collection: 'workouts',
        createdAt: earlier,
        updatedAt: now,
        deletedAt: now,
      },
    ])
  })

  it('does not tombstone the same row twice', () => {
    const previous = new Map<string, CachedRecord>([
      [
        'workouts/w1',
        {
          meta: {
            id: 'w1',
            collection: 'workouts',
            createdAt: earlier,
            updatedAt: earlier,
            deletedAt: earlier,
          },
          json: '',
        },
      ],
    ])
    expect(diffRecords(previous, [], now).tombstones).toEqual([])
  })

  it('brings a row back to life if it returns, keeping its original createdAt', () => {
    const previous = new Map<string, CachedRecord>([
      [
        'workouts/w1',
        {
          meta: {
            id: 'w1',
            collection: 'workouts',
            createdAt: earlier,
            updatedAt: earlier,
            deletedAt: earlier,
          },
          json: '',
        },
      ],
    ])
    const { writes } = diffRecords(
      previous,
      [{ collection: 'workouts', id: 'w1', value: workout('w1', '2026-08-20T18:00:00.000Z') }],
      now,
    )
    expect(writes[0].meta.deletedAt).toBeUndefined()
    expect(writes[0].meta.createdAt).toBe(earlier)
  })

  it('tombstones a one-of-a-kind row when it is cleared', () => {
    const before = recordsFromSnapshot({
      ...EMPTY_SNAPSHOT,
      story: { programId: 'treeline', startedAt: '2026-08-01', completedDays: [] },
    })
    const { tombstones } = diffRecords(cache(before, earlier), [], now)
    expect(tombstones.map((t) => t.collection)).toEqual(['story'])
  })
})

describe('withRecordIds', () => {
  it('gives weigh-ins stored before rows existed an id that survives a reload', () => {
    const entries = [
      { date: '2026-08-27', kg: 81 },
      { date: '2026-08-27', kg: 80.5 },
    ]
    const first = withRecordIds(entries)
    expect(first.map((e) => e.id)).toEqual(['bw-2026-08-27-0', 'bw-2026-08-27-1'])
    expect(withRecordIds(first)).toBe(first)
  })
})

describe('isExpiredTombstone', () => {
  const meta = {
    id: 'w1',
    collection: 'workouts' as const,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }

  it('keeps a fresh tombstone and drops one nobody can still be behind', () => {
    const now = Date.parse('2026-08-28T00:00:00.000Z')
    expect(isExpiredTombstone({ ...meta, deletedAt: '2026-08-01T00:00:00.000Z' }, now, 90)).toBe(false)
    expect(isExpiredTombstone({ ...meta, deletedAt: '2026-01-01T00:00:00.000Z' }, now, 90)).toBe(true)
    expect(isExpiredTombstone(meta, now, 90)).toBe(false)
  })
})

/**
 * The reducers decide where a new item lands in its array; the rebuild
 * decides where it lands after a refresh. If those two ever disagree,
 * someone's history quietly reshuffles when they reload, so pin it.
 */
describe('what the app shows and what a reload rebuilds', () => {
  it('agrees on order for every collection the store appends to', () => {
    hydrateGym(EMPTY_SNAPSHOT)
    const store = useGym.getState()

    const older = store.createPlan('Older')
    const newer = store.createPlan('Newer')

    store.logBodyweight(82)
    store.logBodyweight(81.5)

    store.addExercise({
      id: 'anvil-row',
      name: 'Anvil Row',
      muscle: 'back',
      equipment: 'barbell',
    })
    store.addExercise({
      id: 'zebra-press',
      name: 'Zebra Press',
      muscle: 'shoulders',
      equipment: 'dumbbell',
    })

    for (const weight of [60, 65]) {
      useGym.getState().startWorkout()
      useGym.getState().addSet('bench', weight, 8)
      useGym.getState().finishWorkout()
    }

    const live = snapshotGym()
    const rebuilt = roundTrip(live)

    expect(rebuilt.plans.map((p) => p.id)).toEqual([newer, older])
    expect(rebuilt.plans.map((p) => p.id)).toEqual(live.plans.map((p) => p.id))
    expect(rebuilt.bodyweight.map((b) => b.kg)).toEqual(live.bodyweight.map((b) => b.kg))
    expect(rebuilt.customExercises.map((e) => e.id)).toEqual(live.customExercises.map((e) => e.id))
    expect(rebuilt.workouts.map((w) => w.id)).toEqual(live.workouts.map((w) => w.id))

    hydrateGym(EMPTY_SNAPSHOT)
  })
})
