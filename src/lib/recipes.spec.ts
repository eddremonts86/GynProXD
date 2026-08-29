import { describe, expect, it } from 'vitest'
import { nutritionTargetFor } from './nutrition-target'
import {
  parseDish,
  parseDishList,
  rankSuggestions,
  suggestionsQuery,
  type RecipeSuggestion,
} from './recipes'
import { seedFrom } from './seed'
import type { OnboardingInput } from './types'

const input: OnboardingInput = {
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

const dish = {
  id: 'abc123',
  provider: 'fatsecret',
  title: 'Grilled Chicken Bowl',
  imageUrl: 'https://m.ftscrt.com/static/recipe/x.jpg',
  kcal: 520,
  proteinG: 42,
  readyInMinutes: 25,
  category: 'Main Dish',
  directions: ['Season the chicken.', 'Grill 6 minutes per side.'],
  ingredients: ['2 chicken breasts', '1 cup rice'],
  sourceUrl: 'https://www.fatsecret.com/recipes/x',
}

describe('seedFrom', () => {
  it('is deterministic', () => {
    expect(seedFrom('2026-08-30')).toBe(seedFrom('2026-08-30'))
    expect(seedFrom('2026-08-30')).not.toBe(seedFrom('2026-08-31'))
  })
})

describe('parseDish', () => {
  it('accepts a full server dish', () => {
    const parsed = parseDish(dish)
    expect(parsed).not.toBeNull()
    expect(parsed!.provider).toBe('fatsecret')
    expect(parsed!.kcal).toBe(520)
    expect(parsed!.directions).toEqual(dish.directions)
  })

  it('drops dishes missing id, title, image or a known provider', () => {
    expect(parseDish({ ...dish, imageUrl: '' })).toBeNull()
    expect(parseDish({ ...dish, title: '  ' })).toBeNull()
    expect(parseDish({ ...dish, provider: 'spoonacular' })).toBeNull()
    expect(parseDish(null)).toBeNull()
  })

  it('drops malformed optionals instead of repairing them', () => {
    const parsed = parseDish({ ...dish, kcal: 'lots', directions: ['ok', 42, ''] })
    expect(parsed!.kcal).toBeUndefined()
    expect(parsed!.directions).toEqual(['ok'])
  })

  it('treats a null readyInMinutes from the server as absent', () => {
    const parsed = parseDish({ ...dish, readyInMinutes: null })
    expect(parsed!.readyInMinutes).toBeUndefined()
  })
})

describe('parseDishList', () => {
  it('keeps only valid items', () => {
    const raw = { items: [dish, { ...dish, id: '' }, 'junk'] }
    expect(parseDishList(raw)).toHaveLength(1)
    expect(parseDishList({})).toEqual([])
    expect(parseDishList(undefined)).toEqual([])
  })
})

describe('suggestionsQuery', () => {
  it('sends only a calorie ceiling in a deficit', () => {
    const target = nutritionTargetFor(input) // adelgazar => deficit
    const params = new URLSearchParams(suggestionsQuery(target, '2026-08-30'))
    expect(params.get('date')).toBe('2026-08-30')
    expect(params.get('maxKcal')).toBeTruthy()
    expect(params.get('minKcal')).toBeNull()
    expect(Number(params.get('minProtein'))).toBeGreaterThan(0)
  })

  it('sends a calorie band in a surplus', () => {
    const target = nutritionTargetFor({ ...input, goal: 'musculo', targetWeightKg: 100 })
    const params = new URLSearchParams(suggestionsQuery(target, '2026-08-30'))
    expect(Number(params.get('minKcal'))).toBeGreaterThan(0)
    expect(Number(params.get('maxKcal'))).toBeGreaterThan(Number(params.get('minKcal')))
  })

  it('stays within the ranges the server accepts', () => {
    const target = nutritionTargetFor({ ...input, goal: 'musculo', targetWeightKg: 100 })
    const params = new URLSearchParams(suggestionsQuery(target, '2026-08-30'))
    expect(Number(params.get('maxKcal'))).toBeLessThanOrEqual(4000)
    expect(Number(params.get('maxKcal'))).toBeGreaterThanOrEqual(100)
    expect(Number(params.get('minProtein'))).toBeLessThanOrEqual(300)
  })
})

describe('rankSuggestions', () => {
  const mk = (id: string, kcal: number, proteinG: number): RecipeSuggestion => ({
    id,
    provider: 'sample',
    title: id,
    imageUrl: 'x.jpg',
    kcal,
    proteinG,
  })

  it('prefers protein density in a deficit', () => {
    const target = nutritionTargetFor(input)
    const ranked = rankSuggestions([mk('a', 700, 30), mk('b', 400, 38)], target)
    expect(ranked[0].id).toBe('b')
  })

  it('sends missing-macro dishes to the back', () => {
    const target = nutritionTargetFor(input)
    const noMacros: RecipeSuggestion = {
      id: 'c',
      provider: 'sample',
      title: 'c',
      imageUrl: 'x.jpg',
    }
    const ranked = rankSuggestions([noMacros, mk('b', 400, 38)], target)
    expect(ranked[ranked.length - 1].id).toBe('c')
  })
})
