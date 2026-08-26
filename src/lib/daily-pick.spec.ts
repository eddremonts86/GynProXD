import { describe, expect, it } from 'vitest'
import { exerciseOfTheDay, surpriseExercise, teachablePool } from './daily-pick'

describe('exerciseOfTheDay', () => {
  it('is deterministic for a date and changes across dates', () => {
    expect(exerciseOfTheDay('2026-08-26').id).toBe(exerciseOfTheDay('2026-08-26').id)
    const week = ['2026-08-26', '2026-08-27', '2026-08-28', '2026-08-29']
    expect(new Set(week.map((d) => exerciseOfTheDay(d).id)).size).toBeGreaterThan(1)
  })

  it('only ever picks movements with instructions', () => {
    for (const e of teachablePool()) expect(e.instructions?.length ?? 0).toBeGreaterThan(0)
    expect(exerciseOfTheDay('2026-08-26').instructions?.length).toBeGreaterThan(0)
  })
})

describe('surpriseExercise', () => {
  it('maps the injected RNG onto the pool deterministically', () => {
    const pool = teachablePool()
    expect(surpriseExercise(() => 0).id).toBe(pool[0].id)
    expect(surpriseExercise(() => 0.999999).id).toBe(pool[pool.length - 1].id)
  })
})
