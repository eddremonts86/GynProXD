import { describe, expect, it } from 'vitest'
import { DURATION_WEEKS, estimatePlan } from './plan-estimate'
import type { OnboardingInput } from './types'

const base: OnboardingInput = {
  age: 40,
  sex: 'hombre',
  weightKg: 140,
  targetWeightKg: 80,
  heightCm: 178,
  goal: 'adelgazar',
  level: 'principiante',
  daysPerWeek: 3,
  minsPerSession: 120,
  equipment: 'hibrido',
  effort: 3,
}

describe('recommendedDuration', () => {
  /* B-01: it used to pick the nearest option, which could sit below the
     estimate — telling you the goal needs 7 months and then suggesting 6. */
  it('never recommends a duration shorter than the estimate', () => {
    for (const targetWeightKg of [80, 90, 100, 110, 120, 130]) {
      const r = estimatePlan({ ...base, targetWeightKg }, 'mensual')
      const recommended = DURATION_WEEKS[r.recommendedDuration]
      const longest = Math.max(...Object.values(DURATION_WEEKS))
      if (r.estimatedWeeks <= longest) {
        expect(recommended).toBeGreaterThanOrEqual(r.estimatedWeeks)
      } else {
        expect(recommended).toBe(longest)
      }
    }
  })

  it('picks the shortest option that still fits', () => {
    /* 140 -> 130 at 0.7 kg/week is about 15 weeks: too long for trimestral
       (12), so semestral (24) is right and anual would be overkill. */
    const r = estimatePlan({ ...base, targetWeightKg: 130 }, 'mensual')
    expect(r.estimatedWeeks).toBeGreaterThan(12)
    expect(r.estimatedWeeks).toBeLessThanOrEqual(24)
    expect(r.recommendedDuration).toBe('semestral')
  })

  it('falls back to the longest option when nothing fits', () => {
    const r = estimatePlan(base, 'mensual')
    expect(r.estimatedWeeks).toBeGreaterThan(DURATION_WEEKS.anual)
    expect(r.recommendedDuration).toBe('anual')
  })
})

describe('estimatePlan', () => {
  it('estimates realistic months for 60kg loss', () => {
    const r = estimatePlan(base, 'mensual')
    expect(r.estimatedWeeks).toBeGreaterThan(60)
    expect(r.estimatedWeeks).toBeLessThan(100)
    expect(r.estimatedMonths).toBeGreaterThanOrEqual(14)
    expect(r.estimatedMonths).toBeLessThanOrEqual(24)
    expect(r.rateKgPerWeek).toBeCloseTo(0.7, 1)
    expect(r.isUnrealistic).toBe(true)
    expect(r.warnings[0]).toMatch(/more than the/i)
    expect(r.milestones.at(-1)?.weight).toBe(80)
  })

  it('anual still unrealistic for 60kg loss', () => {
    const r = estimatePlan(base, 'anual')
    expect(r.isUnrealistic).toBe(true)
    expect(r.estimatedWeeks).toBeGreaterThan(52)
  })

  it('higher effort reduces weeks', () => {
    const low = estimatePlan({ ...base, effort: 1 }, 'mensual')
    const high = estimatePlan({ ...base, effort: 5 }, 'mensual')
    expect(low.estimatedWeeks).toBeGreaterThan(high.estimatedWeeks)
    expect(high.rateKgPerWeek).toBeGreaterThan(low.rateKgPerWeek)
  })

  it('muscle gain estimate', () => {
    const input: OnboardingInput = {
      age: 25,
      sex: 'hombre',
      weightKg: 70,
      targetWeightKg: 80,
      heightCm: 175,
      goal: 'musculo',
      level: 'principiante',
      daysPerWeek: 4,
      minsPerSession: 60,
      equipment: 'hibrido',
      effort: 3,
    }
    const r = estimatePlan(input, 'trimestral')
    expect(r.estimatedWeeks).toBeGreaterThan(20)
    expect(r.estimatedWeeks).toBeLessThan(40)
    expect(r.rateKgPerWeek).toBeCloseTo(0.35, 1)
  })

  it('a weight target drives the timeline even for strength or general goals', () => {
    const r = estimatePlan({ ...base, goal: 'general', weightKg: 95, targetWeightKg: 85 }, 'mensual')
    expect(r.openEnded).toBe(false)
    expect(r.rateKgPerWeek).toBeGreaterThan(0)
    expect(r.estimatedWeeks).toBeGreaterThan(8)
  })

  it('general goal without delta uses requested', () => {
    const input: OnboardingInput = {
      age: 30,
      sex: 'mujer',
      weightKg: 65,
      goal: 'general',
      level: 'intermedio',
      daysPerWeek: 2,
      minsPerSession: 45,
      equipment: 'bodyweight',
      effort: 2,
    }
    const r = estimatePlan(input, 'mensual')
    expect(r.estimatedWeeks).toBe(4)
    expect(r.isUnrealistic).toBe(false)
    expect(r.openEnded).toBe(true)
    expect(r.milestones).toHaveLength(0)
  })

  it('milestones increase every 4 weeks', () => {
    const r = estimatePlan(base, 'mensual')
    expect(r.milestones[0].week).toBe(4)
    expect(r.milestones[1].week).toBe(8)
  })
})
