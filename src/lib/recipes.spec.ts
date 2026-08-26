import { describe, expect, it } from 'vitest'
import { nutritionTargetFor } from './nutrition-target'
import {
  DAILY_CATEGORIES,
  dailyCategoryFor,
  isPlate,
  parseMealDbDetail,
  parseMealDbList,
  parseSpoonacularResults,
  rankSuggestions,
  seedFrom,
  spoonacularQuery,
  type RecipeSuggestion,
} from './recipes'
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

describe('seedFrom', () => {
  it('is deterministic and spreads across categories', () => {
    expect(seedFrom('2026-08-26')).toBe(seedFrom('2026-08-26'))
    expect(seedFrom('2026-08-26')).not.toBe(seedFrom('2026-08-27'))
    const hits = new Set(
      Array.from({ length: 30 }, (_, i) => dailyCategoryFor(`2026-09-${String(i + 1).padStart(2, '0')}`)),
    )
    expect(hits.size).toBeGreaterThan(3)
    for (const c of hits) expect(DAILY_CATEGORIES).toContain(c)
  })
})

describe('isPlate', () => {
  it('rejects condiments and preserves, keeps meals', () => {
    expect(isPlate('Red onion pickle')).toBe(false)
    expect(isPlate('Tomato and basil sauce')).toBe(false)
    expect(isPlate('Strawberry jam')).toBe(false)
    expect(isPlate('Vegan Chocolate Cake')).toBe(false)
    expect(isPlate('Peanut butter cookies')).toBe(false)
    expect(isPlate('Teriyaki Chicken Casserole')).toBe(true)
    expect(isPlate('Beef Wellington')).toBe(true)
    expect(isPlate('Pancakes')).toBe(true)
  })
})

describe('parseMealDbList', () => {
  it('keeps well-formed meals and drops the rest', () => {
    const parsed = parseMealDbList({
      meals: [
        { idMeal: '52772', strMeal: 'Teriyaki Chicken Casserole', strMealThumb: 'https://x/1.jpg' },
        { idMeal: '9', strMeal: '', strMealThumb: 'https://x/2.jpg' },
        { strMeal: 'No id', strMealThumb: 'https://x/3.jpg' },
        null,
      ],
    })
    expect(parsed).toEqual([
      { id: '52772', title: 'Teriyaki Chicken Casserole', imageUrl: 'https://x/1.jpg' },
    ])
  })

  it('returns empty on garbage', () => {
    expect(parseMealDbList(null)).toEqual([])
    expect(parseMealDbList({ meals: null })).toEqual([])
    expect(parseMealDbList('nope')).toEqual([])
  })
})

describe('parseMealDbDetail', () => {
  it('maps the fields and links to TheMealDB when no source is given', () => {
    const dish = parseMealDbDetail({
      meals: [
        {
          idMeal: '52772',
          strMeal: 'Teriyaki Chicken Casserole',
          strMealThumb: 'https://x/1.jpg',
          strCategory: 'Chicken',
          strArea: 'Japanese',
          strSource: null,
          strYoutube: null,
        },
      ],
    })
    expect(dish).toMatchObject({
      id: '52772',
      source: 'mealdb',
      category: 'Chicken',
      area: 'Japanese',
      sourceUrl: 'https://www.themealdb.com/meal/52772',
    })
  })

  it('rejects a meal without an image', () => {
    expect(
      parseMealDbDetail({ meals: [{ idMeal: '1', strMeal: 'Ghost dish', strMealThumb: '' }] }),
    ).toBeNull()
  })
})

describe('spoonacularQuery', () => {
  it('caps calories in a deficit and floors them in a surplus', () => {
    const cut = new URLSearchParams(spoonacularQuery(nutritionTargetFor(input), '2026-08-26'))
    expect(cut.get('maxCalories')).toBeTruthy()
    expect(cut.get('minCalories')).toBeNull()
    expect(Number(cut.get('minProtein'))).toBeGreaterThan(0)
    expect(cut.get('number')).toBe('3')

    const bulk = new URLSearchParams(
      spoonacularQuery(
        nutritionTargetFor({ ...input, weightKg: 70, targetWeightKg: 100, goal: 'musculo' }),
        '2026-08-26',
      ),
    )
    expect(bulk.get('minCalories')).toBeTruthy()
  })

  it('is stable for a date and changes with it', () => {
    const t = nutritionTargetFor(input)
    expect(spoonacularQuery(t, '2026-08-26')).toBe(spoonacularQuery(t, '2026-08-26'))
    expect(spoonacularQuery(t, '2026-08-26')).not.toBe(spoonacularQuery(t, '2026-08-27'))
  })
})

describe('parseSpoonacularResults', () => {
  it('reads nutrition out of the nutrients array', () => {
    const parsed = parseSpoonacularResults({
      results: [
        {
          id: 986003,
          title: 'Instant Pot Chicken Tacos',
          image: 'https://img.spoonacular.com/recipes/986003-312x231.jpg',
          readyInMinutes: 25,
          sourceUrl: 'https://www.pinkwhen.com/instant-pot-chicken-tacos',
          nutrition: {
            nutrients: [
              { name: 'Calories', amount: 546.3 },
              { name: 'Protein', amount: 97.17 },
            ],
          },
        },
        { id: 1, title: 'No image' },
      ],
    })
    expect(parsed).toHaveLength(1)
    expect(parsed[0]).toMatchObject({
      id: '986003',
      source: 'spoonacular',
      kcal: 546,
      proteinG: 97,
      readyInMinutes: 25,
    })
  })
})

describe('rankSuggestions', () => {
  const dish = (id: string, kcal: number, proteinG: number): RecipeSuggestion => ({
    id,
    source: 'sample',
    title: id,
    imageUrl: 'https://x/1.jpg',
    kcal,
    proteinG,
  })

  it('prefers protein density in a deficit', () => {
    const ranked = rankSuggestions(
      [dish('heavy', 800, 40), dish('lean', 450, 45), dish('mid', 600, 42)],
      nutritionTargetFor(input),
    )
    expect(ranked.map((r) => r.id)).toEqual(['lean', 'mid', 'heavy'])
  })

  it('prefers the fullest plate in a surplus and never mutates its input', () => {
    const items = [dish('light', 450, 40), dish('big', 900, 50)]
    const ranked = rankSuggestions(
      items,
      nutritionTargetFor({ ...input, weightKg: 70, targetWeightKg: 100, goal: 'musculo' }),
    )
    expect(ranked[0].id).toBe('big')
    expect(items[0].id).toBe('light')
  })

  it('sends dishes without numbers to the back', () => {
    const ranked = rankSuggestions(
      [{ id: 'mystery', source: 'sample', title: 'x', imageUrl: 'https://x/1.jpg' }, dish('lean', 450, 45)],
      nutritionTargetFor(input),
    )
    expect(ranked[ranked.length - 1].id).toBe('mystery')
  })
})
