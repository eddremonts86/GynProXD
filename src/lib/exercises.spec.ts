import { describe, expect, it } from 'vitest'
import type { Exercise, Workout } from './types'
import { bestE1rm, epley1rm, lastPerformance } from './exercises'
import { isPersonalRecord, suggestNext } from './progression'

const ex: Exercise = { id: 'bench-press', name: 'Bench Press', muscle: 'chest', equipment: 'barbell' }
const pushup: Exercise = { id: 'push-up', name: 'Push-Up', muscle: 'chest', equipment: 'bodyweight' }

const workout = (date: string, sets: [number, number][], exerciseId = 'bench-press'): Workout => ({
  id: date + exerciseId,
  date,
  exercises: [{ exerciseId, sets: sets.map(([weight, reps]) => ({ weight, reps })) }],
})

describe('epley1rm', () => {
  it('computes epley formula', () => {
    expect(epley1rm(100, 1)).toBeCloseTo(103.33, 1)
    expect(epley1rm(100, 10)).toBeCloseTo(133.33, 1)
  })

  it('does not extrapolate beyond 12 reps', () => {
    expect(epley1rm(100, 15)).toBe(100)
    expect(epley1rm(0, 10)).toBe(0)
  })
})

describe('lastPerformance', () => {
  it('returns most recent first and skips empty entries', () => {
    const ws = [
      workout('2026-08-20', [[60, 8]]),
      { id: 'x', date: '2026-08-22', exercises: [{ exerciseId: 'bench-press', sets: [] }] },
      workout('2026-08-21', [[62.5, 5]]),
    ]
    expect(lastPerformance(ws, 'bench-press')?.sets[0]).toEqual({ weight: 62.5, reps: 5 })
  })
})

describe('suggestNext', () => {
  it('linear adds 2.5kg at same reps', () => {
    const s = suggestNext('linear', ex, [workout('2026-08-20', [[60, 8], [60, 8]])])
    expect(s).toEqual({ weight: 62.5, reps: 8, reason: expect.stringContaining('+2.5kg') })
  })

  it('linear with no history returns null', () => {
    expect(suggestNext('linear', ex, [])).toBeNull()
  })

  it('double progression holds weight until all sets reach max reps', () => {
    const partial = suggestNext('double', ex, [workout('2026-08-20', [[60, 12], [60, 9]])])
    expect(partial?.weight).toBe(60)
    expect(partial?.reps).toBe(12)

    const complete = suggestNext('double', ex, [workout('2026-08-20', [[60, 12], [60, 12]])])
    expect(complete?.weight).toBe(62.5)
    expect(complete?.reps).toBe(8)
  })

  it('bodyweight progresses in reps', () => {
    const s = suggestNext('linear', pushup, [workout('2026-08-20', [[0, 15]], 'push-up')])
    expect(s?.reps).toBe(16)
    expect(s?.weight).toBe(0)
  })

  it('none rule returns null', () => {
    expect(suggestNext('none', ex, [workout('2026-08-20', [[60, 8]])])).toBeNull()
  })
})

describe('isPersonalRecord', () => {
  it('fires when beating past best', () => {
    const past = [workout('2026-08-01', [[80, 5]])]
    expect(isPersonalRecord('bench-press', { weight: 82.5, reps: 5 }, past, [])).toBe(true)
  })

  it('does not fire below past best', () => {
    const past = [workout('2026-08-01', [[90, 5]])]
    expect(isPersonalRecord('bench-press', { weight: 82.5, reps: 5 }, past, [])).toBe(false)
  })

  it('compares within the current workout too', () => {
    const past = [workout('2026-08-01', [[80, 5]])]
    expect(
      isPersonalRecord('bench-press', { weight: 85, reps: 3 }, past, [{ weight: 90, reps: 3 }]),
    ).toBe(false)
  })
})

describe('bestE1rm', () => {
  it('takes the max across sessions', () => {
    const ws = [workout('2026-08-01', [[80, 5]]), workout('2026-08-08', [[75, 8]])]
    expect(bestE1rm(ws, 'bench-press')).toBeCloseTo(Math.max(epley1rm(80, 5), epley1rm(75, 8)), 5)
  })
})
