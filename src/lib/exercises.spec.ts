import { describe, expect, it } from 'vitest'
import type { Exercise, Workout } from './types'
import { bestE1rm, e1rmSeries, epley1rm, exerciseLookup, lastPerformance, libraryOrder } from './exercises'
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
    expect(s).toEqual({ weight: 62.5, reps: 8, reason: expect.stringContaining('2.5kg more') })
  })

  it('linear with no history returns null', () => {
    expect(suggestNext('linear', ex, [])).toBeNull()
  })

  it('double progression holds weight until all sets reach max reps', () => {
    const partial = suggestNext('double', ex, [workout('2026-08-20', [[60, 12], [60, 9]])])
    expect(partial?.weight).toBe(60)
    expect(partial?.reps).toBe(12)

    /* Two sets at max reps is thin evidence — the load increase needs three. */
    const thin = suggestNext('double', ex, [workout('2026-08-20', [[60, 12], [60, 12]])])
    expect(thin?.weight).toBe(60)

    const complete = suggestNext('double', ex, [
      workout('2026-08-20', [[60, 12], [60, 12], [60, 12]]),
    ])
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

describe('e1rmSeries', () => {
  it('produces chronological series', () => {
    const ws = [workout('2026-08-08', [[75, 8]]), workout('2026-08-01', [[80, 5]])]
    expect(e1rmSeries(ws, 'bench-press')).toEqual([
      { date: '2026-08-01', e1rm: Math.round(epley1rm(80, 5) * 10) / 10 },
      { date: '2026-08-08', e1rm: Math.round(epley1rm(75, 8) * 10) / 10 },
    ])
  })

  it('skips empty', () => {
    const ws = [
      workout('2026-08-01', [[80, 5]]),
      { id: 'x', date: '2026-08-02', exercises: [{ exerciseId: 'bench-press', sets: [] }] } as Workout,
    ]
    expect(e1rmSeries(ws, 'bench-press')).toHaveLength(1)
  })
})

describe('libraryOrder', () => {
  const photo: Exercise = {
    ...ex,
    id: 'z-photo',
    name: 'Zercher Squat',
    image: 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Z/0.jpg',
  }
  const illustration: Exercise = { ...ex, id: 'y-repdb', name: 'Yates Row', image: '/repdb/y-peak.webp' }
  const fromWger: Exercise = {
    ...ex,
    id: 'wger-1',
    name: 'Ab Wheel',
    image: 'https://wger.de/media/exercise-images/1/a.png',
  }
  const bare: Exercise = { ...ex, id: 'a-bare', name: 'Ab Roller', image: null }
  const alsoBare: Exercise = { ...ex, id: 'b-bare', name: 'Back Lever' }

  it('ranks our own artwork, then wger, then nothing at all', () => {
    const order = libraryOrder([bare, fromWger, photo, alsoBare, illustration])
    expect(order.map((e) => e.id)).toEqual(['y-repdb', 'z-photo', 'wger-1', 'a-bare', 'b-bare'])
  })

  it('keeps each band alphabetical', () => {
    const order = libraryOrder([photo, illustration])
    expect(order.map((e) => e.name)).toEqual(['Yates Row', 'Zercher Squat'])
  })

  it('sorts a wger image above no image even when the name says otherwise', () => {
    /* "Ab Wheel" precedes "Ab Roller" only because it has something to show. */
    expect(libraryOrder([bare, fromWger]).map((e) => e.id)).toEqual(['wger-1', 'a-bare'])
  })

  it('does not mutate what it was given', () => {
    const input = [bare, photo]
    libraryOrder(input)
    expect(input.map((e) => e.id)).toEqual(['a-bare', 'z-photo'])
  })
})

describe('exerciseLookup', () => {
  const own: Exercise = { id: 'custom-1', name: 'My Movement', muscle: 'core', equipment: 'bodyweight' }
  const fromServer: Exercise = { id: 'srv-1', name: 'Sled Push', muscle: 'quads', equipment: 'other' }

  it('merges the bundled catalogue, the server rows and the member\'s own', () => {
    const map = exerciseLookup([own], [fromServer])
    expect(map.get('Barbell_Curl')?.name).toBe('Barbell Curl')
    expect(map.get('srv-1')).toEqual(fromServer)
    expect(map.get('custom-1')).toEqual(own)
  })

  it('withdraws a hidden id whichever catalogue it came from', () => {
    const map = exerciseLookup([own], [fromServer], ['Barbell_Curl', 'srv-1', 'custom-1'])
    expect(map.has('Barbell_Curl')).toBe(false)
    expect(map.has('srv-1')).toBe(false)
    expect(map.has('custom-1')).toBe(false)
    /* Everything else is untouched. */
    expect(map.get('Pullups')?.name).toBe('Pullups')
  })

  it('hides a wger movement too', () => {
    expect(exerciseLookup([], [], ['wger-1966']).has('wger-1966')).toBe(false)
    expect(exerciseLookup([], []).has('wger-1966')).toBe(true)
  })

  it('ignores a hidden id nothing matches', () => {
    const before = exerciseLookup([], []).size
    expect(exerciseLookup([], [], ['does-not-exist']).size).toBe(before)
  })
})
