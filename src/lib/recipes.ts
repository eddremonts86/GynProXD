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
  /** How many servings the recipe as written makes, when the source says. */
  servings?: number
  category?: string
  area?: string
  directions?: string[]
  ingredients?: string[]
  /**
   * Servings of this dish that hit the member's meal window, decided by the
   * server. `kcal` and `proteinG` stay per serving — the source's own
   * measurement — so anything that shows or ranks a plate goes through
   * `dishTotals` rather than multiplying by hand.
   */
  portions?: number
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
    servings: asNumber(r?.servings),
    category: asText(r?.category),
    sourceUrl: asText(r?.sourceUrl),
    directions: asSteps(r?.directions),
    ingredients: asSteps(r?.ingredients),
    portions: asNumber(r?.portions),
  }
}

/**
 * How many servings of a dish land inside a meal window, or 0 when none do.
 * Mirrors `portionsFor` in pb_hooks/utils/recipes_lib.js — the JSVM and the
 * bundle cannot share a module, so the rule is written twice on purpose, the
 * same way `seedFrom` is. Capped by what the recipe actually makes, so the
 * advice never asks for more of it than exists.
 */
export const MAX_PORTIONS = 3

export function portionsForDish(
  dish: RecipeSuggestion,
  window: { maxKcal: number; minProtein: number; minKcal?: number },
): number {
  if (dish.kcal === undefined || dish.proteinG === undefined || dish.kcal <= 0) return 0
  const cap =
    dish.servings !== undefined && dish.servings >= 1
      ? Math.min(MAX_PORTIONS, Math.floor(dish.servings))
      : MAX_PORTIONS
  for (let n = 1; n <= cap; n++) {
    const kcal = dish.kcal * n
    const protein = dish.proteinG * n
    if (kcal > window.maxKcal) break
    if (protein >= window.minProtein && (!window.minKcal || kcal >= window.minKcal)) return n
  }
  return 0
}

/** The plate as recommended: per-serving numbers times the served portions. */
export function dishTotals(dish: RecipeSuggestion): {
  portions: number
  kcal: number | undefined
  proteinG: number | undefined
} {
  const portions = dish.portions !== undefined && dish.portions > 1 ? dish.portions : 1
  return {
    portions,
    kcal: dish.kcal === undefined ? undefined : Math.round(dish.kcal * portions),
    proteinG: dish.proteinG === undefined ? undefined : Math.round(dish.proteinG * portions),
  }
}

/**
 * Whether to offer a link out. Our public-domain rows carry the whole recipe —
 * photo, ingredients, steps, nutrition — so a "view the full recipe" link
 * would promise something more complete than what is already on screen, and
 * it would point at an Internet Archive snapshot of a site the government
 * retired in January 2026. The bundled samples have no steps in the app, and
 * fatsecret's terms require the credit, so those keep theirs.
 */
export function showsSourceLink(provider: RecipeProvider): boolean {
  return provider !== 'pd'
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

export interface RecipePage {
  items: RecipeSuggestion[]
  page: number
  hasMore: boolean
  /** Size of the whole catalogue, when the server can count it. */
  total: number | null
}

export interface CatalogueQuery {
  q?: string
  category?: string
  minProtein?: number
  maxKcal?: number
  sort?: 'name' | 'protein' | 'light' | 'quick'
  page?: number
}

export function catalogueQuery(query: CatalogueQuery): string {
  const params = new URLSearchParams()
  if (query.q) params.set('q', query.q)
  if (query.category) params.set('category', query.category)
  if (query.minProtein) params.set('minProtein', String(query.minProtein))
  if (query.maxKcal) params.set('maxKcal', String(query.maxKcal))
  if (query.sort && query.sort !== 'name') params.set('sort', query.sort)
  if (query.page) params.set('page', String(query.page))
  return params.toString()
}

/** A page of the catalogue. Null means the server could not be reached. */
export async function fetchCatalogue(query: CatalogueQuery): Promise<RecipePage | null> {
  try {
    const res = await fetch(`/pb/api/enforma/recipes?${catalogueQuery(query)}`, {
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) return null
    const raw = (await res.json()) as Record<string, unknown>
    return {
      items: parseDishList(raw),
      page: typeof raw.page === 'number' ? raw.page : 0,
      hasMore: raw.hasMore === true,
      total: typeof raw.total === 'number' ? raw.total : null,
    }
  } catch {
    return null
  }
}

/** One recipe by id, so the recipe page survives a refresh or a shared link. */
export async function fetchRecipe(id: string): Promise<RecipeSuggestion | null> {
  try {
    const res = await fetch(`/pb/api/enforma/recipe/${encodeURIComponent(id)}`, {
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
    const { kcal, proteinG } = dishTotals(r)
    if (kcal === undefined || proteinG === undefined) return -1
    if (target.direction === 'deficit') return proteinG / Math.max(kcal, 1)
    if (target.direction === 'surplus') return kcal + proteinG
    return -Math.abs(kcal - mid)
  }
  return [...items].sort((a, b) => score(b) - score(a))
}
