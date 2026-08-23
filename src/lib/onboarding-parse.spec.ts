import { describe, expect, it } from 'vitest'
import { mergeWithDefaults, parseOnboarding } from './onboarding-parse'

describe('parseOnboarding', () => {
  it('parses example 140->80 3x2h', () => {
    const text = 'soy un hombre de 40 anos que solo puedo ir al gymnacio 3 veces a la semana durante 2h al dia. Peso 140kg y quiero adelgazar a 80kg'
    const { partial, confidence } = parseOnboarding(text)
    expect(partial.sex).toBe('hombre')
    expect(partial.age).toBe(40)
    expect(partial.weightKg).toBe(140)
    expect(partial.targetWeightKg).toBe(80)
    expect(partial.goal).toBe('adelgazar')
    expect(partial.daysPerWeek).toBe(3)
    expect(partial.minsPerSession).toBe(120)
    expect(confidence).toBeGreaterThan(0.5)
    const merged = mergeWithDefaults(partial)
    expect(merged.effort).toBe(3)
    expect(merged.level).toBe('principiante')
  })

  it('parses chica 25 adelgazar', () => {
    const { partial } = parseOnboarding('mujer 25 años 65kg objetivo 58kg gym 4 veces 60min esfuerzo alto')
    expect(partial.sex).toBe('mujer')
    expect(partial.goal).toBe('adelgazar')
    expect(partial.daysPerWeek).toBe(4)
    expect(partial.minsPerSession).toBe(60)
    expect(partial.effort).toBe(5)
  })

  it('defaults when empty', () => {
    const { partial } = parseOnboarding('')
    const merged = mergeWithDefaults(partial)
    expect(merged.weightKg).toBe(75)
    expect(merged.goal).toBe('general')
  })
})
