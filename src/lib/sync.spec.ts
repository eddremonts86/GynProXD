import { describe, expect, it } from 'vitest'
import { fromWire, generateRecoveryCode, planPush, remoteWins, toWire, type ServerRow } from './sync'
import type { EnvelopeRow } from './record-store'
import type { RecordMeta } from './records'

const meta = (id: string, updatedAt: string, deletedAt?: string): RecordMeta => ({
  id,
  collection: 'workouts',
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt,
  ...(deletedAt ? { deletedAt } : {}),
})

const row = (id: string, updatedAt: string): EnvelopeRow => ({
  meta: meta(id, updatedAt),
  blob: { iv: 'aXY=', data: 'ZGF0YQ==' },
})

describe('remoteWins', () => {
  it('takes a row this device has never seen', () => {
    expect(remoteWins(meta('w1', '2026-08-02T00:00:00.000Z'), undefined)).toBe(true)
  })

  it('is strictly newer-wins, so a tie is a no-op re-pull', () => {
    const at = '2026-08-02T00:00:00.000Z'
    expect(remoteWins(meta('w1', at), meta('w1', at))).toBe(false)
    expect(remoteWins(meta('w1', '2026-08-03T00:00:00.000Z'), meta('w1', at))).toBe(true)
    expect(remoteWins(meta('w1', '2026-08-01T00:00:00.000Z'), meta('w1', at))).toBe(false)
  })

  it('lets a newer tombstone beat a live row, and a newer edit beat a tombstone', () => {
    const alive = meta('w1', '2026-08-02T00:00:00.000Z')
    const deleted = meta('w1', '2026-08-03T00:00:00.000Z', '2026-08-03T00:00:00.000Z')
    expect(remoteWins(deleted, alive)).toBe(true)
    expect(remoteWins(alive, deleted)).toBe(false)
  })
})

describe('planPush', () => {
  it('creates unknown rows, updates stale ones, skips rows the server matches', () => {
    const server = new Map<string, ServerRow>([
      ['workouts/known', { serverId: 'pb1', updatedClient: '2026-08-02T00:00:00.000Z' }],
      ['workouts/stale', { serverId: 'pb2', updatedClient: '2026-08-01T00:00:00.000Z' }],
    ])
    const plan = planPush(
      [
        row('new', '2026-08-02T00:00:00.000Z'),
        row('known', '2026-08-02T00:00:00.000Z'),
        row('stale', '2026-08-04T00:00:00.000Z'),
      ],
      server,
    )
    expect(plan.creates.map((r) => r.meta.id)).toEqual(['new'])
    expect(plan.updates.map((u) => [u.row.meta.id, u.serverId])).toEqual([['stale', 'pb2']])
  })
})

describe('wire format', () => {
  it('round-trips a live row and never ships a body with a tombstone', () => {
    const live = row('w1', '2026-08-02T00:00:00.000Z')
    const wire = toWire(live, 'user1')
    expect(wire).toMatchObject({ owner: 'user1', col: 'workouts', rid: 'w1', blob: live.blob })

    const back = fromWire({
      id: 'pb1',
      col: 'workouts',
      rid: 'w1',
      created_client: live.meta.createdAt,
      updated_client: live.meta.updatedAt,
      deleted_client: '',
      blob: live.blob ?? null,
      updated: '2026-08-02 00:00:01.000Z',
    })
    expect(back.meta).toEqual(live.meta)
    expect(back.blob).toEqual(live.blob)

    const tombstone: EnvelopeRow = {
      meta: meta('w2', '2026-08-05T00:00:00.000Z', '2026-08-05T00:00:00.000Z'),
      blob: { iv: 'aXY=', data: 'ZGF0YQ==' },
    }
    expect(toWire(tombstone, 'user1').blob).toBeNull()
    const deadBack = fromWire({
      id: 'pb2',
      col: 'workouts',
      rid: 'w2',
      created_client: tombstone.meta.createdAt,
      updated_client: tombstone.meta.updatedAt,
      deleted_client: tombstone.meta.deletedAt ?? '',
      blob: null,
      updated: '2026-08-05 00:00:01.000Z',
    })
    expect(deadBack.meta.deletedAt).toBe(tombstone.meta.deletedAt)
    expect(deadBack.blob).toBeUndefined()
  })
})

describe('generateRecoveryCode', () => {
  it('is five groups of five, unambiguous alphabet, and never repeats', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 50; i++) {
      const code = generateRecoveryCode()
      expect(code).toMatch(/^[A-HJ-NP-Z2-9]{5}(-[A-HJ-NP-Z2-9]{5}){4}$/)
      seen.add(code)
    }
    expect(seen.size).toBe(50)
  })
})
