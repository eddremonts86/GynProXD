import { describe, expect, it } from 'vitest'
import { suggestNext } from './progression'
import type { Exercise, SetEntry, Workout } from './types'

const bench: Exercise = { id: 'bench', name: 'Bench Press', muscle: 'chest', equipment: 'barbell' }

const lastSession = (sets: SetEntry[]): Workout[] => [
  { id: 'w1', date: '2026-08-20', exercises: [{ exerciseId: 'bench', sets }] },
]

describe('suggestNext, double progression', () => {
  it('adds load after three or more sets at max reps', () => {
    const s = suggestNext('double', bench, lastSession([
      { weight: 60, reps: 12 },
      { weight: 60, reps: 12 },
      { weight: 60, reps: 12 },
    ]))
    expect(s?.weight).toBe(62.5)
    expect(s?.reps).toBe(8)
  })

  it('holds the load when max reps were hit on fewer than three sets', () => {
    const s = suggestNext('double', bench, lastSession([
      { weight: 60, reps: 12 },
      { weight: 60, reps: 12 },
    ]))
    expect(s?.weight).toBe(60)
    expect(s?.reps).toBe(12)
    expect(s?.reason).toContain('3 sets')
  })

  it('pushes reps at the same weight while below max reps', () => {
    const s = suggestNext('double', bench, lastSession([
      { weight: 60, reps: 10 },
      { weight: 60, reps: 9 },
      { weight: 60, reps: 8 },
    ]))
    expect(s?.weight).toBe(60)
  })
})
