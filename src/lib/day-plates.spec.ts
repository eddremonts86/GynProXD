import { describe, expect, it } from 'vitest'
import { pickPerDay } from './day-plates'
import type { RecipeSuggestion } from './recipes'

const pool = (n: number): RecipeSuggestion[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `r${i}`,
    provider: 'pd' as const,
    title: `Dish ${i}`,
    imageUrl: `${i}.jpg`,
  }))

const week = ['2026-08-31', '2026-09-02', '2026-09-04']

describe('pickPerDay', () => {
  it('gives every day a different plate', () => {
    const picks = pickPerDay(pool(10), week)
    const ids = week.map((d) => picks[d]?.id)
    expect(new Set(ids).size).toBe(3)
    expect(ids.every((id) => id !== undefined)).toBe(true)
  })

  it('is deterministic: the same day always gets the same plate', () => {
    expect(pickPerDay(pool(10), week)['2026-09-02']?.id).toBe(
      pickPerDay(pool(10), week)['2026-09-02']?.id,
    )
  })

  it('varies across weeks rather than repeating one dish', () => {
    const p = pool(10)
    const first = week.map((d) => pickPerDay(p, week)[d]?.id)
    const next = ['2026-09-07', '2026-09-09', '2026-09-11']
    const second = next.map((d) => pickPerDay(p, next)[d]?.id)
    expect(first).not.toEqual(second)
  })

  it('keeps going when there are fewer plates than days', () => {
    const picks = pickPerDay(pool(2), week)
    expect(week.every((d) => picks[d] !== undefined)).toBe(true)
  })

  it('returns nothing at all for an empty pool', () => {
    expect(pickPerDay([], week)).toEqual({})
  })
})
