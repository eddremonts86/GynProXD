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

  it('parses an English description', () => {
    const { partial, confidence } = parseOnboarding(
      'male, 40 years old, 140kg and want to get down to 80kg, gym 3 times a week for 2h, effort medium',
    )
    expect(partial.sex).toBe('hombre')
    expect(partial.age).toBe(40)
    expect(partial.weightKg).toBe(140)
    expect(partial.targetWeightKg).toBe(80)
    expect(partial.goal).toBe('adelgazar')
    expect(partial.equipment).toBe('barbell')
    expect(partial.daysPerWeek).toBe(3)
    expect(partial.minsPerSession).toBe(120)
    expect(partial.effort).toBe(3)
    expect(confidence).toBeGreaterThan(0.5)
  })

  it('parses English bodyweight and beginner wording', () => {
    const { partial } = parseOnboarding(
      'beginner woman, 65kg, calisthenics at home, 4 days a week, 45 minutes, build muscle',
    )
    expect(partial.sex).toBe('mujer')
    expect(partial.level).toBe('principiante')
    expect(partial.equipment).toBe('bodyweight')
    expect(partial.goal).toBe('musculo')
    expect(partial.daysPerWeek).toBe(4)
    expect(partial.minsPerSession).toBe(45)
  })

  it('defaults when empty', () => {
    const { partial } = parseOnboarding('')
    const merged = mergeWithDefaults(partial)
    expect(merged.weightKg).toBe(75)
    expect(merged.goal).toBe('general')
  })
})
