import { beforeEach, describe, expect, it } from 'vitest'
import { KDF_ITERATIONS, decryptJson, deriveKey, encryptJson, fromBase64, toBase64 } from './crypto'
import {
  clearProfileRecords,
  listEnvelopes,
  loadProfileRecords,
  persistProfile,
  reencryptProfileRecords,
  writeAllRecords,
} from './record-store'
import { EMPTY_SNAPSHOT, type GymSnapshot } from '../store/useGym'
import type { Workout } from './types'

/**
 * The privacy promise, tested where it is kept. Everything else in the app
 * assumes that what record-store writes cannot be read without the
 * passphrase and cannot be altered without notice; this is the one place
 * that assumption is checked directly rather than through sync.
 */

/* Plain Node has no localStorage; the store reads and writes it directly. */
function useMemoryStorage(): Map<string, string> {
  const store = new Map<string, string>()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      get length() {
        return store.size
      },
      key: (i: number) => [...store.keys()][i] ?? null,
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, String(v)),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
    },
  })
  return store
}

const SALT = new TextEncoder().encode('record-store.spec')
/* Real PBKDF2 at the app's own count is slow by design; one round per key. */
const keyFor = (passphrase: string) => deriveKey(passphrase, SALT, 1000)

function workout(id: string, exercise: string): Workout {
  return {
    id,
    date: '2026-09-02',
    startedAt: '2026-09-02T07:00:00.000Z',
    exercises: [{ exerciseId: exercise, sets: [{ weight: 60, reps: 8 }] }],
  }
}

function snapshotWith(...workouts: Workout[]): GymSnapshot {
  return { ...EMPTY_SNAPSHOT, workouts }
}

const PROFILE = 'p-ana'

describe('what rests on disk', () => {
  let store: Map<string, string>
  beforeEach(() => {
    store = useMemoryStorage()
  })

  it('carries no body in the clear', async () => {
    const key = await keyFor('ana-secret')
    await writeAllRecords(PROFILE, key, snapshotWith(workout('w1', 'zercher-squat')))

    const raw = [...store.values()].join('\n')
    expect(raw).not.toContain('zercher-squat')
    expect(raw).not.toContain('"weight"')
    /* The metadata a server needs to merge is plaintext by design. */
    expect(raw).toContain('"collection":"workouts"')
    expect(raw).toContain('"id":"w1"')
  })

  it('comes back whole under the same passphrase', async () => {
    const key = await keyFor('ana-secret')
    await writeAllRecords(PROFILE, key, snapshotWith(workout('w1', 'bench')))

    const { snapshot } = await loadProfileRecords(PROFILE, await keyFor('ana-secret'))
    expect(snapshot.workouts.map((w) => w.exercises[0].exerciseId)).toEqual(['bench'])
  })

  it('yields nothing to a wrong passphrase', async () => {
    await writeAllRecords(PROFILE, await keyFor('ana-secret'), snapshotWith(workout('w1', 'bench')))

    const { snapshot, cache } = await loadProfileRecords(PROFILE, await keyFor('ana-secre7'))
    expect(snapshot.workouts).toEqual([])
    expect(cache.records.size).toBe(0)
    /* And leaves the rows alone: a wrong key must never destroy data. */
    expect(listEnvelopes(PROFILE)).toHaveLength(1)
  })

  it('refuses a row whose ciphertext was altered by one byte', async () => {
    const key = await keyFor('ana-secret')
    await writeAllRecords(PROFILE, key, snapshotWith(workout('w1', 'bench')))

    const [rowKey] = [...store.keys()].filter((k) => k.startsWith('forma-rec-'))
    const envelope = JSON.parse(store.get(rowKey)!)
    const bytes = fromBase64(envelope.blob.data)
    bytes[3] ^= 0x01
    envelope.blob.data = toBase64(bytes)
    store.set(rowKey, JSON.stringify(envelope))

    await expect(decryptJson(key, envelope.blob)).rejects.toThrow()
    const { snapshot } = await loadProfileRecords(PROFILE, key)
    expect(snapshot.workouts).toEqual([])
  })

  it('never reuses an IV, so equal bodies do not look equal', async () => {
    const key = await keyFor('ana-secret')
    const a = await encryptJson(key, { same: true })
    const b = await encryptJson(key, { same: true })
    expect(a.iv).not.toBe(b.iv)
    expect(a.data).not.toBe(b.data)
    expect(fromBase64(a.iv)).toHaveLength(12)
  })

  it('derives keys at the count the app promises', () => {
    expect(KDF_ITERATIONS).toBe(310_000)
  })
})

describe('the rows over time', () => {
  beforeEach(() => {
    useMemoryStorage()
  })

  it('rewrites only what moved', async () => {
    const key = await keyFor('ana-secret')
    const cache = await writeAllRecords(PROFILE, key, snapshotWith(workout('w1', 'bench')))
    const before = listEnvelopes(PROFILE)[0].blob!.data

    await persistProfile(PROFILE, key, snapshotWith(workout('w1', 'bench'), workout('w2', 'row')), cache)
    const rows = listEnvelopes(PROFILE)
    expect(rows.map((r) => r.meta.id).sort()).toEqual(['w1', 'w2'])
    expect(rows.find((r) => r.meta.id === 'w1')!.blob!.data).toBe(before)
  })

  it('keeps a deleted row as a bodiless tombstone', async () => {
    const key = await keyFor('ana-secret')
    const cache = await writeAllRecords(PROFILE, key, snapshotWith(workout('w1', 'bench')))

    await persistProfile(PROFILE, key, snapshotWith(), cache)
    const [row] = listEnvelopes(PROFILE)
    expect(row.meta.deletedAt).toBeTruthy()
    expect(row.blob).toBeUndefined()
  })

  it('moves every body to a new key and nothing else', async () => {
    const oldKey = await keyFor('ana-secret')
    const newKey = await keyFor('shared-account')
    await writeAllRecords(PROFILE, oldKey, snapshotWith(workout('w1', 'bench')))
    const metaBefore = listEnvelopes(PROFILE)[0].meta

    await reencryptProfileRecords(PROFILE, oldKey, newKey)

    expect(listEnvelopes(PROFILE)[0].meta).toEqual(metaBefore)
    expect((await loadProfileRecords(PROFILE, oldKey)).snapshot.workouts).toEqual([])
    expect((await loadProfileRecords(PROFILE, newKey)).snapshot.workouts).toHaveLength(1)
  })

  it('takes every byte with the profile when it goes', async () => {
    const key = await keyFor('ana-secret')
    await writeAllRecords(PROFILE, key, snapshotWith(workout('w1', 'bench')))
    await writeAllRecords('p-other', key, snapshotWith(workout('w9', 'row')))

    clearProfileRecords(PROFILE)
    expect(listEnvelopes(PROFILE)).toEqual([])
    expect(listEnvelopes('p-other')).toHaveLength(1)
  })
})
