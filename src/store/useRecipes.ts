import { create } from 'zustand'
import { todayIso } from '../lib/dates'
import {
  fetchDailyDish,
  fetchSuggestions,
  rankSuggestions,
  recipeSearchEnabled,
  type RecipeSuggestion,
} from '../lib/recipes'
import { seedFrom } from '../lib/seed'
import { annotateSuggestions } from '../lib/recipe-coach'
import { nutritionTargetFor } from '../lib/nutrition-target'
import { SAMPLE_SUGGESTIONS } from '../data/sample-recipes'
import type { OnboardingInput } from '../lib/types'

/**
 * Device cache for food recommendations. One fetch per day per device is the
 * whole budget story: the dish of the day costs two keyless TheMealDB calls,
 * the aligned suggestions one Spoonacular search, and both live here until
 * the date rolls over. Stale data beats a spinner when the network is out.
 */

const STORE_KEY = 'forma-recipes'

interface DailyCache {
  date: string
  dish: RecipeSuggestion
}

interface SuggestionsCache {
  date: string
  /** Goal and targets baked into the key: a new plan invalidates the cache. */
  key: string
  items: RecipeSuggestion[]
}

interface Persisted {
  daily?: DailyCache
  suggestions?: SuggestionsCache
}

function load(): Persisted {
  try {
    const raw = localStorage.getItem(STORE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    return parsed && typeof parsed === 'object' ? (parsed as Persisted) : {}
  } catch {
    return {}
  }
}

function persist(state: Persisted): void {
  localStorage.setItem(STORE_KEY, JSON.stringify(state))
}

export function suggestionsKeyFor(input: OnboardingInput): string {
  const t = nutritionTargetFor(input)
  return `${input.goal}:${t.kcalTarget}:${t.proteinG}`
}

interface RecipesState {
  daily: DailyCache | null
  suggestions: SuggestionsCache | null
  loadingDaily: boolean
  loadingSuggestions: boolean
  ensureDaily: () => Promise<void>
  ensureSuggestions: (input: OnboardingInput) => Promise<void>
  /**
   * Drops the plan-derived cache (its key holds goal and calorie targets in
   * plaintext). Wired into Settings' "Delete all data"; the dish of the day
   * stays, since it is the same for everyone and derives from nothing personal.
   */
  clearSuggestions: () => void
}

const initial = typeof localStorage === 'undefined' ? {} : load()

export const useRecipes = create<RecipesState>()((set, get) => ({
  daily: initial.daily ?? null,
  suggestions: initial.suggestions ?? null,
  loadingDaily: false,
  loadingSuggestions: false,

  ensureDaily: async () => {
    const today = todayIso()
    const { daily, loadingDaily } = get()
    if (loadingDaily || daily?.date === today) return
    set({ loadingDaily: true })
    try {
      const dish = await fetchDailyDish(today)
      if (dish) {
        const next = { date: today, dish }
        persist({ daily: next, suggestions: get().suggestions ?? undefined })
        set({ daily: next })
      } else if (!daily) {
        // Offline with an empty cache: a seeded sample dish, not a blank card.
        const sample = SAMPLE_SUGGESTIONS[seedFrom(today) % SAMPLE_SUGGESTIONS.length]
        set({ daily: { date: today, dish: sample } })
      }
      // A stale cached dish is kept as-is when the fetch fails.
    } finally {
      set({ loadingDaily: false })
    }
  },

  ensureSuggestions: async (input) => {
    const today = todayIso()
    const key = suggestionsKeyFor(input)
    const { suggestions, loadingSuggestions } = get()
    if (loadingSuggestions || (suggestions?.date === today && suggestions.key === key)) return
    set({ loadingSuggestions: true })
    try {
      const target = nutritionTargetFor(input)
      const fetched = recipeSearchEnabled ? await fetchSuggestions(target, today) : []
      const base = fetched.length > 0 ? fetched : rankSuggestions(SAMPLE_SUGGESTIONS, target)
      const items = await annotateSuggestions(base, target, input)
      const next = { date: today, key, items }
      // The sample fallback is not persisted: retry for real data next visit.
      if (fetched.length > 0) persist({ daily: get().daily ?? undefined, suggestions: next })
      set({ suggestions: next })
    } finally {
      set({ loadingSuggestions: false })
    }
  },

  clearSuggestions: () => {
    persist({ daily: get().daily ?? undefined })
    set({ suggestions: null })
  },
}))

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== STORE_KEY) return
    const next = load()
    useRecipes.setState({ daily: next.daily ?? null, suggestions: next.suggestions ?? null })
  })
}
