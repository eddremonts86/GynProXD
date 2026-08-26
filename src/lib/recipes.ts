import { mealTargets, type NutritionTarget } from './nutrition-target'

/**
 * Recipe suggestions from two free sources. TheMealDB is keyless and allows
 * CORS, so the browser calls it directly; Spoonacular's key stays server-side
 * behind the /api/recipes/spoonacular proxy, exactly like the MiniMax key.
 * Every suggestion carries a real photo URL from its source; nothing here is
 * ever invented, and anything malformed is dropped rather than repaired.
 */

export const recipeSearchEnabled = __RECIPE_SEARCH__

export type RecipeSource = 'mealdb' | 'spoonacular' | 'sample'

export interface RecipeSuggestion {
  id: string
  source: RecipeSource
  title: string
  imageUrl: string
  sourceUrl?: string
  kcal?: number
  proteinG?: number
  readyInMinutes?: number
  category?: string
  area?: string
  /** One sentence from the AI coach on why this dish fits. Optional. */
  coachNote?: string
}

const MEALDB_BASE = 'https://www.themealdb.com/api/json/v1/1'

/**
 * The categories the daily dish rotates through. Curated: TheMealDB also has
 * "Dessert" and "Side", which are not a plate recommendation for a gym, and
 * its "Vegan" category is seven entries of mostly sides and cake, so plant
 * dishes come from the far deeper "Vegetarian" instead.
 */
export const DAILY_CATEGORIES = [
  'Chicken',
  'Seafood',
  'Beef',
  'Vegetarian',
  'Pasta',
  'Breakfast',
  'Lamb',
  'Pork',
] as const

/** FNV-1a. Every device hashes the same date to the same dish, no backend. */
export function seedFrom(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export function dailyCategoryFor(dateIso: string): string {
  return DAILY_CATEGORIES[seedFrom(dateIso) % DAILY_CATEGORIES.length]
}

/**
 * TheMealDB categories mix real plates with condiments and preserves ("Red
 * onion pickle" lives under Vegan). A recommendation must be a meal, so
 * anything titled like a jarred side is skipped, deterministically.
 */
const NON_PLATE_WORDS =
  /\b(pickle|pickled|sauce|dip|jam|chutney|relish|dressing|marinade|gravy|spread|syrup|cake|brownies?|cookies?|fudge|pudding|ice cream)\b/i

export function isPlate(title: string): boolean {
  return !NON_PLATE_WORDS.test(title)
}

interface MealDbListEntry {
  id: string
  title: string
  imageUrl: string
}

function asText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

export function parseMealDbList(raw: unknown): MealDbListEntry[] {
  const meals = (raw as { meals?: unknown })?.meals
  if (!Array.isArray(meals)) return []
  const entries: MealDbListEntry[] = []
  for (const m of meals as Record<string, unknown>[]) {
    const id = asText(m?.idMeal)
    const title = asText(m?.strMeal)
    const imageUrl = asText(m?.strMealThumb)
    if (id && title && imageUrl) entries.push({ id, title, imageUrl })
  }
  return entries
}

export function parseMealDbDetail(raw: unknown): RecipeSuggestion | null {
  const meal = (raw as { meals?: unknown[] })?.meals?.[0] as Record<string, unknown> | undefined
  if (!meal) return null
  const id = asText(meal.idMeal)
  const title = asText(meal.strMeal)
  const imageUrl = asText(meal.strMealThumb)
  if (!id || !title || !imageUrl) return null
  return {
    id,
    source: 'mealdb',
    title,
    imageUrl,
    category: asText(meal.strCategory),
    area: asText(meal.strArea) ?? asText(meal.strCountry),
    sourceUrl:
      asText(meal.strSource) ?? asText(meal.strYoutube) ?? `https://www.themealdb.com/meal/${id}`,
  }
}

/**
 * The dish of the day: two keyless calls, both seeded by the date, so a whole
 * gym's worth of devices converges on the same plate without coordinating.
 */
export async function fetchDailyDish(dateIso: string): Promise<RecipeSuggestion | null> {
  const category = dailyCategoryFor(dateIso)
  const listRes = await fetch(`${MEALDB_BASE}/filter.php?c=${encodeURIComponent(category)}`)
  if (!listRes.ok) return null
  const all = parseMealDbList(await listRes.json())
  const list = all.filter((m) => isPlate(m.title))
  if (list.length === 0) return null

  const pick = list[seedFrom(dateIso + category) % list.length]
  const detailRes = await fetch(`${MEALDB_BASE}/lookup.php?i=${encodeURIComponent(pick.id)}`)
  if (!detailRes.ok) return null
  return parseMealDbDetail(await detailRes.json())
}

/**
 * The daily suggestion query. Deterministic for a given date and target so the
 * cache is coherent and the free-tier points are spent once, not per visit.
 * Direction decides which side of the calorie band is enforced.
 */
export function spoonacularQuery(target: NutritionTarget, dateIso: string): string {
  const meal = mealTargets(target)
  const params = new URLSearchParams()
  params.set('number', '3')
  params.set('type', 'main course')
  params.set('instructionsRequired', 'true')
  params.set('addRecipeNutrition', 'true')
  params.set('sort', 'protein')
  params.set('sortDirection', 'desc')
  params.set('minProtein', String(meal.proteinMinG))
  if (target.direction === 'surplus') {
    params.set('minCalories', String(meal.kcalMin))
    params.set('maxCalories', String(Math.round(meal.kcalMax * 1.25)))
  } else {
    params.set('maxCalories', String(meal.kcalMax))
  }
  // A small seeded offset rotates the shortlist day to day without randomness.
  params.set('offset', String(seedFrom(dateIso) % 12))
  return params.toString()
}

interface SpoonacularNutrient {
  name?: unknown
  amount?: unknown
}

function nutrientAmount(nutrients: unknown, name: string): number | undefined {
  if (!Array.isArray(nutrients)) return undefined
  const hit = (nutrients as SpoonacularNutrient[]).find((n) => n?.name === name)
  return typeof hit?.amount === 'number' ? Math.round(hit.amount) : undefined
}

export function parseSpoonacularResults(raw: unknown): RecipeSuggestion[] {
  const results = (raw as { results?: unknown })?.results
  if (!Array.isArray(results)) return []
  const suggestions: RecipeSuggestion[] = []
  for (const r of results as Record<string, unknown>[]) {
    const id = typeof r?.id === 'number' ? String(r.id) : asText(r?.id)
    const title = asText(r?.title)
    const imageUrl = asText(r?.image)
    if (!id || !title || !imageUrl) continue
    const nutrients = (r.nutrition as { nutrients?: unknown } | undefined)?.nutrients
    suggestions.push({
      id,
      source: 'spoonacular',
      title,
      imageUrl,
      kcal: nutrientAmount(nutrients, 'Calories'),
      proteinG: nutrientAmount(nutrients, 'Protein'),
      readyInMinutes: typeof r.readyInMinutes === 'number' ? r.readyInMinutes : undefined,
      sourceUrl: asText(r.sourceUrl) ?? `https://spoonacular.com/recipes/x-${id}`,
    })
  }
  return suggestions
}

export async function fetchSuggestions(
  target: NutritionTarget,
  dateIso: string,
): Promise<RecipeSuggestion[]> {
  const res = await fetch(`/api/recipes/spoonacular/recipes/complexSearch?${spoonacularQuery(target, dateIso)}`)
  if (!res.ok) return []
  return parseSpoonacularResults(await res.json())
}

/**
 * Deterministic ordering when the AI coach is off or fails. In a deficit the
 * most protein per calorie wins; in a surplus the fullest plate that still
 * meets the protein floor; maintenance prefers the middle of the meal band.
 */
export function rankSuggestions(
  items: RecipeSuggestion[],
  target: NutritionTarget,
): RecipeSuggestion[] {
  const meal = mealTargets(target)
  const mid = (meal.kcalMin + meal.kcalMax) / 2
  const score = (r: RecipeSuggestion): number => {
    if (r.kcal === undefined || r.proteinG === undefined) return -1
    if (target.direction === 'deficit') return r.proteinG / Math.max(r.kcal, 1)
    if (target.direction === 'surplus') return r.kcal + r.proteinG
    return -Math.abs(r.kcal - mid)
  }
  return [...items].sort((a, b) => score(b) - score(a))
}
