import { describe, expect, it } from 'vitest'
import { estimatePlan } from './plan-estimate'
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
  })

  it('milestones increase every 4 weeks', () => {
    const r = estimatePlan(base, 'mensual')
    expect(r.milestones[0].week).toBe(4)
    expect(r.milestones[1].week).toBe(8)
  })
})
