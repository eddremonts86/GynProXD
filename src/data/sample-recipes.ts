import type { RecipeSuggestion } from '../lib/recipes'

/**
 * Offline and no-key fallback dishes. Real TheMealDB entries with their CDN
 * photos; the macro numbers are editorial estimates for these three plates
 * only (bundled content, like the sample menu's prices), never presented as
 * source data. Live suggestions always carry their provider's numbers.
 */
export const SAMPLE_SUGGESTIONS: RecipeSuggestion[] = [
  {
    id: '52772',
    provider: 'sample',
    title: 'Teriyaki Chicken Casserole',
    imageUrl: 'https://www.themealdb.com/images/media/meals/wvpsxx1468256321.jpg',
    sourceUrl: 'https://www.themealdb.com/meal/52772',
    category: 'Chicken',
    area: 'Japanese',
    kcal: 620,
    proteinG: 48,
  },
  {
    id: '52773',
    provider: 'sample',
    title: 'Honey Teriyaki Salmon',
    imageUrl: 'https://www.themealdb.com/images/media/meals/xxyupu1468262513.jpg',
    sourceUrl: 'https://www.themealdb.com/meal/52773',
    category: 'Seafood',
    area: 'Japanese',
    kcal: 520,
    proteinG: 40,
  },
  {
    id: '52807',
    provider: 'sample',
    title: 'Baingan Bharta',
    imageUrl: 'https://www.themealdb.com/images/media/meals/urtpqw1487341253.jpg',
    sourceUrl: 'https://www.themealdb.com/meal/52807',
    category: 'Vegetarian',
    area: 'Indian',
    kcal: 380,
    proteinG: 12,
  },
]
