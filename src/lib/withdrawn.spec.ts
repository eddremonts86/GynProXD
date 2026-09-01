import { afterEach, describe, expect, it } from 'vitest'
import { isWithdrawn, setWithdrawn, withdrawnIds } from './withdrawn'
import { allowedExerciseIds, candidateIdsByMuscle, generatePlan } from './plan-generator'
import type { OnboardingInput } from './types'

/* Device state, so every test puts it back. */
afterEach(() => setWithdrawn([]))

const input: OnboardingInput = {
  age: 34,
  sex: 'hombre',
  weightKg: 92,
  goal: 'fuerza',
  level: 'principiante',
  daysPerWeek: 3,
  minsPerSession: 60,
  equipment: 'hibrido',
  effort: 3,
}

describe('withdrawn registry', () => {
  it('starts empty, so nothing changes until an admin says so', () => {
    expect(withdrawnIds().size).toBe(0)
    expect(isWithdrawn('Barbell_Curl')).toBe(false)
  })

  it('replaces rather than accumulates, so restoring one puts it back', () => {
    setWithdrawn(['Barbell_Curl'])
    expect(isWithdrawn('Barbell_Curl')).toBe(true)
    setWithdrawn([])
    expect(isWithdrawn('Barbell_Curl')).toBe(false)
  })
})

describe('the plan generator honours a withdrawal', () => {
  it('drops it from the pool the coach is grounded in', () => {
    expect(allowedExerciseIds('hibrido').has('Barbell_Curl')).toBe(true)
    setWithdrawn(['Barbell_Curl'])
    expect(allowedExerciseIds('hibrido').has('Barbell_Curl')).toBe(false)
  })

  it('drops it from the candidates offered per muscle', () => {
    expect(candidateIdsByMuscle('hibrido').biceps).toContain('Barbell_Curl')
    setWithdrawn(['Barbell_Curl'])
    expect(candidateIdsByMuscle('hibrido').biceps).not.toContain('Barbell_Curl')
  })

  it('never programmes it, staple though it is', () => {
    const picked = (plan: ReturnType<typeof generatePlan>) =>
      new Set(plan.weeks.flatMap((w) => w.days.flatMap((d) => d.exercises.map((e) => e.exerciseId))))

    expect(picked(generatePlan(input, 'anual'))).toContain('Barbell_Curl')
    setWithdrawn(['Barbell_Curl'])
    const after = picked(generatePlan(input, 'anual'))
    expect(after).not.toContain('Barbell_Curl')
    /* The slot is filled by something else rather than left empty. */
    expect(after.size).toBeGreaterThan(10)
  })

  it('still returns a plan when a whole muscle is withdrawn', () => {
    const biceps = [...candidateIdsByMuscle('hibrido', 500).biceps]
    setWithdrawn(biceps)
    const plan = generatePlan(input, 'mensual')
    const ids = plan.weeks.flatMap((w) => w.days.flatMap((d) => d.exercises.map((e) => e.exerciseId)))
    expect(ids.length).toBeGreaterThan(0)
    expect(ids.some((id) => biceps.includes(id))).toBe(false)
  })
})
