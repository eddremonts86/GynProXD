import { describe, expect, it } from 'vitest'
import { scoreFitnessTest, testIsStale } from './fitness-test'

describe('scoreFitnessTest', () => {
  it('bands each axis and takes the weaker strength half', () => {
    const r = scoreFitnessTest({ pushups: 30, squats: 15, highKnees: 80 }, '2026-08-26')
    expect(r.strength).toBe('principiante') // squats lag despite advanced push-ups
    expect(r.cardio).toBe('intermedio')
  })

  it('scores a strong all-rounder as advanced with high effort', () => {
    const r = scoreFitnessTest({ pushups: 30, squats: 45, highKnees: 110 }, '2026-08-26')
    expect(r.strength).toBe('avanzado')
    expect(r.cardio).toBe('avanzado')
    expect(r.suggestedEffort).toBe(4)
  })

  it('scores a true beginner gently', () => {
    const r = scoreFitnessTest({ pushups: 4, squats: 10, highKnees: 40 }, '2026-08-26')
    expect(r.strength).toBe('principiante')
    expect(r.cardio).toBe('principiante')
    expect(r.suggestedEffort).toBe(2)
  })
})

describe('testIsStale', () => {
  it('turns stale at eight weeks', () => {
    const r = scoreFitnessTest({ pushups: 10, squats: 20, highKnees: 60 }, '2026-06-01')
    expect(testIsStale(r, '2026-07-01')).toBe(false)
    expect(testIsStale(r, '2026-08-26')).toBe(true)
  })
})
