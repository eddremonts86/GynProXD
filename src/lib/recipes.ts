import { mealTargets, type NutritionTarget } from './nutrition-target'
import { serverCapabilities } from './capabilities'
import { activeAuthHeader } from './sync'

/**
 * Food recommendations come from the app's own sync server (phase 8): a
 * local-first catalogue in PocketBase where public-domain rows (USDA MyPlate)
 * live forever and FatSecret rows are a 24-hour rolling cache the server
 * tops up on demand. The browser never talks to a recipe vendor directly.
 * Every dish carries a real photo; anything malformed is dropped, never
 * repaired. `parseDish` mirrors dishFromRecord in pb_hooks/utils/recipes_lib.
 */

export type RecipeProvider = 'pd' | 'fatsecret' | 'sample'

export interface RecipeSuggestion {
  id: string
  provider: RecipeProvider
  title: string
  imageUrl: string
  sourceUrl?: string
  kcal?: number
  proteinG?: number
  readyInMinutes?: number
  category?: string
  area?: string
  directions?: string[]
  ingredients?: string[]
  /** One sentence from the AI coach on why this dish fits. Optional. */
  coachNote?: string
}

/** Suggestions need a signed-in member; the server owns every vendor key. */
export function recipeSearchEnabled(): boolean {
  return serverCapabilities().recipes && activeAuthHeader() !== null
}

function asText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.round(value)
    : undefined
}

function asSteps(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const steps = value.filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
  return steps.length > 0 ? steps : undefined
}

export function parseDish(raw: unknown): RecipeSuggestion | null {
  const r = raw as Record<string, unknown> | null | undefined
  const id = asText(r?.id)
  const title = asText(r?.title)
  const imageUrl = asText(r?.imageUrl)
  const provider = r?.provider === 'pd' || r?.provider === 'fatsecret' ? r.provider : undefined
  if (!id || !title || !imageUrl || !provider) return null
  return {
    id,
    provider,
    title,
    imageUrl,
    kcal: asNumber(r?.kcal),
    proteinG: asNumber(r?.proteinG),
    readyInMinutes: asNumber(r?.readyInMinutes),
    category: asText(r?.category),
    sourceUrl: asText(r?.sourceUrl),
    directions: asSteps(r?.directions),
    ingredients: asSteps(r?.ingredients),
  }
}

export function parseDishList(raw: unknown): RecipeSuggestion[] {
  const items = (raw as { items?: unknown })?.items
  if (!Array.isArray(items)) return []
  const dishes: RecipeSuggestion[] = []
  for (const item of items) {
    const dish = parseDish(item)
    if (dish) dishes.push(dish)
  }
  return dishes
}

/**
 * The daily suggestion query. Deterministic for a given date and target so
 * the server cache is coherent and vendor calls happen once, not per visit.
 * Direction decides which side of the calorie band is enforced.
 */
export function suggestionsQuery(target: NutritionTarget, dateIso: string): string {
  const meal = mealTargets(target)
  const params = new URLSearchParams()
  params.set('date', dateIso)
  params.set('minProtein', String(meal.proteinMinG))
  if (target.direction === 'surplus') {
    params.set('minKcal', String(meal.kcalMin))
    params.set('maxKcal', String(Math.round(meal.kcalMax * 1.25)))
  } else {
    params.set('maxKcal', String(meal.kcalMax))
  }
  return params.toString()
}

/** The server computes and caches the same daily pick once for everyone. */
export async function fetchDailyDish(dateIso: string): Promise<RecipeSuggestion | null> {
  try {
    const res = await fetch(`/pb/api/enforma/daily-dish?date=${encodeURIComponent(dateIso)}`, {
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return null
    return parseDish(await res.json())
  } catch {
    return null
  }
}

export async function fetchSuggestions(
  target: NutritionTarget,
  dateIso: string,
): Promise<RecipeSuggestion[]> {
  try {
    const res = await fetch(
      `/pb/api/enforma/recipes/suggestions?${suggestionsQuery(target, dateIso)}`,
      { headers: activeAuthHeader() ?? {}, signal: AbortSignal.timeout(20000) },
    )
    if (!res.ok) return []
    return parseDishList(await res.json())
  } catch {
    return []
  }
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
