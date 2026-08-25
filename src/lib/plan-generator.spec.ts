import { describe, expect, it } from 'vitest'
import { generatePlan } from './plan-generator'
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

describe('generatePlan', () => {
  it('generates semestral weeks when requested realistic', () => {
    const input: OnboardingInput = { ...base, weightKg: 80, targetWeightKg: 78, goal: 'adelgazar' }
    const plan = generatePlan(input, 'mensual', new Date('2026-01-05'))
    expect(plan.weeks).toHaveLength(4)
    expect(plan.weeks[0].days).toHaveLength(3)
    expect(plan.weeklyTemplate.days.filter((d) => d.exercises.length > 0)).toHaveLength(3)
  })

  it('uses deload every 4th week', () => {
    const input: OnboardingInput = { ...base, weightKg: 80, targetWeightKg: 78 }
    const plan = generatePlan(input, 'mensual', new Date('2026-01-05'))
    const week3 = plan.weeks[3]
    const week0 = plan.weeks[0]
    expect(week3.days[0].exercises.length).toBeLessThanOrEqual(week0.days[0].exercises.length)
    expect(week3.days[0].exercises.every((e) => e.progression === 'none')).toBe(true)
  })

  it('unrealistic 60kg in trimestral picks anual', () => {
    const plan = generatePlan(base, 'trimestral', new Date('2026-01-05'))
    expect(plan.approvedDuration).toBe('anual')
    expect(plan.weeks).toHaveLength(52)
    expect(plan.estimatedWeeks).toBeGreaterThan(52)
    expect(plan.warnings.length).toBeGreaterThan(0)
  })

  it('produces milestones', () => {
    const plan = generatePlan(base, 'semestral')
    expect(plan.milestones.length).toBeGreaterThan(0)
    expect(plan.milestones.at(-1)?.weight).toBe(80)
  })

  it('rotates movements between 4-week blocks and anchors staples', () => {
    const plan = generatePlan(base, 'trimestral', new Date('2026-01-05'))
    const week0 = plan.weeks[0].days[0].exercises.map((e) => e.exerciseId)
    const week4 = plan.weeks[4].days[0].exercises.map((e) => e.exerciseId)
    expect(week4).not.toEqual(week0)
    // A beginner's first block leads with classics, not alphabet accidents.
    const all = new Set(plan.weeks[0].days.flatMap((d) => d.exercises.map((e) => e.exerciseId)))
    expect(all.has('Barbell_Bench_Press_-_Medium_Grip') || all.has('Pushups')).toBe(true)
  })

  it('weeklyTemplate syncable to planner', () => {
    const plan = generatePlan({ ...base, weightKg: 70, targetWeightKg: 75, goal: 'musculo' }, 'trimestral')
    expect(plan.weeklyTemplate.id).toMatch(/plan-gen-/)
    expect(plan.weeklyTemplate.days.length).toBe(7)
  })
})
