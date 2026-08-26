import { describe, expect, it } from 'vitest'
import {
  activityFactor,
  basalMetabolicRate,
  mealTargets,
  nutritionTargetFor,
} from './nutrition-target'
import type { OnboardingInput } from './types'

const base: OnboardingInput = {
  age: 30,
  sex: 'hombre',
  weightKg: 90,
  targetWeightKg: 80,
  heightCm: 180,
  goal: 'adelgazar',
  level: 'intermedio',
  daysPerWeek: 4,
  minsPerSession: 60,
  equipment: 'hibrido',
  effort: 3,
}

describe('basalMetabolicRate', () => {
  it('matches Mifflin-St Jeor for the published cases', () => {
    // 10*90 + 6.25*180 + -5*30 + 5 = 1880
    expect(basalMetabolicRate('hombre', 90, 180, 30)).toBe(1880)
    // Same body, female constant: 1875 - 161 = 1714
    expect(basalMetabolicRate('mujer', 90, 180, 30)).toBe(1714)
  })

  it("takes the midpoint for 'otro'", () => {
    const male = basalMetabolicRate('hombre', 70, 170, 40)
    const female = basalMetabolicRate('mujer', 70, 170, 40)
    expect(basalMetabolicRate('otro', 70, 170, 40)).toBe((male + female) / 2)
  })
})

describe('activityFactor', () => {
  it('grows with training days inside a sane band', () => {
    expect(activityFactor(1)).toBeCloseTo(1.4, 10)
    expect(activityFactor(3)).toBeCloseTo(1.5, 10)
    expect(activityFactor(7)).toBeCloseTo(1.7, 10)
  })
})

describe('nutritionTargetFor', () => {
  it('cuts below maintenance for 90kg heading to 80kg', () => {
    const t = nutritionTargetFor(base)
    expect(t.direction).toBe('deficit')
    expect(t.deltaKcal).toBeLessThanOrEqual(-250)
    expect(t.deltaKcal).toBeGreaterThanOrEqual(-750)
    expect(t.kcalTarget).toBeLessThan(t.tdee)
    expect(t.kcalTarget % 10).toBe(0)
    // Cutting keeps protein high: 2 g/kg on 90 kg
    expect(t.proteinG).toBe(180)
  })

  it('builds above maintenance for 70kg heading to 100kg', () => {
    const t = nutritionTargetFor({
      ...base,
      weightKg: 70,
      targetWeightKg: 100,
      goal: 'musculo',
    })
    expect(t.direction).toBe('surplus')
    expect(t.deltaKcal).toBeGreaterThanOrEqual(200)
    expect(t.deltaKcal).toBeLessThanOrEqual(500)
    expect(t.kcalTarget).toBeGreaterThan(t.tdee)
    expect(t.proteinG).toBe(Math.round(70 * 1.8))
  })

  it('holds steady without a weight target', () => {
    const t = nutritionTargetFor({ ...base, targetWeightKg: undefined, goal: 'general' })
    expect(t.direction).toBe('maintain')
    expect(t.deltaKcal).toBe(0)
    expect(Math.abs(t.kcalTarget - t.tdee)).toBeLessThanOrEqual(5)
  })

  it('assumes 170cm when height is missing and says so', () => {
    const t = nutritionTargetFor({ ...base, heightCm: undefined })
    expect(t.heightAssumed).toBe(true)
    expect(t.bmr).toBe(basalMetabolicRate('hombre', 90, 170, 30))
  })

  it('never targets below 1200 kcal', () => {
    const t = nutritionTargetFor({
      ...base,
      sex: 'mujer',
      weightKg: 48,
      targetWeightKg: 44,
      heightCm: 150,
      age: 70,
      daysPerWeek: 1,
      effort: 5,
    })
    expect(t.kcalTarget).toBeGreaterThanOrEqual(1200)
  })
})

describe('mealTargets', () => {
  it('carves a main meal out of the day with a protein floor', () => {
    const t = nutritionTargetFor(base)
    const m = mealTargets(t)
    expect(m.kcalMin).toBeLessThan(m.kcalMax)
    expect(m.kcalMax).toBeLessThan(t.kcalTarget)
    expect(m.proteinMinG).toBe(Math.round(t.proteinG * 0.3))
  })
})
