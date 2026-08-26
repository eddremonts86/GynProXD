import { describe, expect, it } from 'vitest'
import { bodyweightDelta, rangeVolume, sessionCountsByExercise, weeklyVolumeSeries } from './stats'
import type { Workout } from './types'

const workout = (date: string, weight: number, reps: number): Workout => ({
  id: date,
  date,
  exercises: [{ exerciseId: 'x', sets: [{ weight, reps }] }],
})

describe('weeklyVolumeSeries', () => {
  it('buckets sessions into Monday-based weeks and keeps empty weeks', () => {
    // 2026-08-25 is a Tuesday; its week starts Monday 2026-08-24.
    const today = new Date(2026, 7, 25)
    const series = weeklyVolumeSeries(
      [workout('2026-08-24', 100, 5), workout('2026-08-25', 50, 4), workout('2026-08-10', 80, 10)],
      4,
      today,
    )
    expect(series.map((p) => p.start)).toEqual(['2026-08-03', '2026-08-10', '2026-08-17', '2026-08-24'])
    expect(series[1]).toMatchObject({ volume: 800, sessions: 1 })
    expect(series[2]).toMatchObject({ volume: 0, sessions: 0 })
    expect(series[3]).toMatchObject({ volume: 700, sets: 2, sessions: 2 })
  })
})

describe('rangeVolume', () => {
  it('sums inclusive bounds only', () => {
    const w = [workout('2026-08-01', 10, 10), workout('2026-08-05', 20, 10), workout('2026-08-09', 30, 10)]
    expect(rangeVolume(w, '2026-08-01', '2026-08-05')).toBe(300)
  })
})

describe('sessionCountsByExercise', () => {
  it('counts performances per exercise across sessions', () => {
    const counts = sessionCountsByExercise([
      workout('2026-08-24', 100, 5),
      workout('2026-08-25', 100, 5),
      { id: 'w3', date: '2026-08-26', exercises: [{ exerciseId: 'y', sets: [{ weight: 20, reps: 8 }] }] },
    ])
    expect(counts.get('x')).toBe(2)
    expect(counts.get('y')).toBe(1)
    expect(counts.get('z')).toBeUndefined()
  })

  it('is empty for no workouts', () => {
    expect(sessionCountsByExercise([]).size).toBe(0)
  })
})

describe('bodyweightDelta', () => {
  it('needs two points inside the window', () => {
    const today = new Date(2026, 7, 25)
    expect(bodyweightDelta([{ date: '2026-08-01', kg: 90 }], 30, today)).toBeNull()
    expect(
      bodyweightDelta(
        [
          { date: '2026-08-01', kg: 91.2 },
          { date: '2026-08-20', kg: 89.8 },
        ],
        30,
        today,
      ),
    ).toBe(-1.4)
  })
})
