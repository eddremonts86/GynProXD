import { describe, expect, it } from 'vitest'
import { assemblePlan, generatePlan } from './plan-generator'
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

/**
 * A programme whose blocks differ, assembled.
 *
 * This is the shape "1 mes en casa y luego al gym" has to survive into, and the
 * live coach is the wrong place to prove it: it answers on some runs and not on
 * others, and when it declines the deterministic designer takes over, which does
 * not phase by design. So the structure is handed in directly and the assembly
 * is what gets checked.
 */
describe('assemblePlan with blocks that differ', () => {
  const day = (d: 'mon' | 'thu', ids: string[]) => ({
    day: d,
    exercises: ids.map((exerciseId) => ({ exerciseId, progression: 'linear' as const })),
  })
  const structure = {
    source: 'coach' as const,
    name: 'Home then gym',
    blocks: [
      {
        days: [day('mon', ['Pushups', 'Bodyweight_Squat', 'Plank'])],
        label: 'Month 1, home',
        place: 'bodyweight' as const,
        intensity: 'II' as const,
      },
      {
        days: [day('mon', ['Barbell_Full_Squat', 'Dumbbell_Shoulder_Press', 'Dumbbell_Squat'])],
        label: 'Gym, heavier',
        place: 'barbell' as const,
        intensity: 'III' as const,
      },
    ],
  }

  const plan = assemblePlan(base, 'trimestral', structure, new Date('2026-09-07T00:00:00'))

  it('keeps one metadata entry per block, and no second copy of the days', () => {
    expect(plan.blocks).toHaveLength(2)
    expect(plan.blocks![0]).toEqual({ label: 'Month 1, home', place: 'bodyweight', intensity: 'II' })
    expect(plan.blocks![1]).toEqual({ label: 'Gym, heavier', place: 'barbell', intensity: 'III' })
    expect(plan.blocks![0]).not.toHaveProperty('days')
  })

  it('tells every week which block it belongs to', () => {
    // Four weeks to a block, cycling. Week 5 is the second block, week 9 the first again.
    expect(plan.weeks[0].blockIndex).toBe(0)
    expect(plan.weeks[3].blockIndex).toBe(0)
    expect(plan.weeks[4].blockIndex).toBe(1)
    expect(plan.weeks[8].blockIndex).toBe(0)
  })

  it('puts different movements in the first month and the ones after it', () => {
    const idsOf = (weekIndex: number) =>
      plan.weeks[weekIndex].days.flatMap((d) => d.exercises.map((e) => e.exerciseId))
    const firstMonth = idsOf(0)
    const secondMonth = idsOf(4)
    expect(firstMonth.length).toBeGreaterThan(0)
    expect(secondMonth.length).toBeGreaterThan(0)
    // The whole point of the change: a home month and a gym month share nothing.
    expect(firstMonth.some((id) => secondMonth.includes(id))).toBe(false)
    expect(firstMonth).toContain('Pushups')
    expect(secondMonth).toContain('Barbell_Full_Squat')
  })
})
