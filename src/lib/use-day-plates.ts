import { useEffect, useMemo, useState } from 'react'
import { useGym } from '../store/useGym'
import { mealTargets, nutritionTargetFor } from './nutrition-target'
import { pickPerDay } from './day-plates'
import {
  MAX_PORTIONS,
  fetchCatalogue,
  portionsForDish,
  type RecipeSuggestion,
} from './recipes'

/**
 * The plate a given day is meant to carry, wherever that day is shown. One
 * pool is fetched for the member's meal window and dealt out per date, so the
 * programme, the planner and the day detail all name the same dish for the
 * same day without asking the server three times.
 */
export function useDayPlates(dates: string[]): Record<string, RecipeSuggestion> {
  const generatedPlans = useGym((s) => s.generatedPlans)
  const input = useMemo(
    () => [...generatedPlans].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]?.input,
    [generatedPlans],
  )

  const window = useMemo(() => {
    if (!input) return null
    const meal = mealTargets(nutritionTargetFor(input))
    return { maxKcal: meal.kcalMax, minProtein: meal.proteinMinG }
  }, [input])

  const [pool, setPool] = useState<RecipeSuggestion[]>([])

  useEffect(() => {
    if (!window) return undefined
    let live = true
    /* Ask wide, decide here: a serving short of the protein floor on its own
       can still clear it two or three at a time. */
    void fetchCatalogue({
      minProtein: Math.max(1, Math.floor(window.minProtein / MAX_PORTIONS)),
      maxKcal: window.maxKcal,
      sort: 'protein',
    }).then((result) => {
      if (!live || !result) return
      const fitted: RecipeSuggestion[] = []
      for (const dish of result.items) {
        const portions = portionsForDish(dish, window)
        if (portions > 0) fitted.push({ ...dish, portions })
      }
      setPool(fitted)
    })
    return () => {
      live = false
    }
  }, [window])

  const key = dates.join(',')
  return useMemo(() => pickPerDay(pool, key === '' ? [] : key.split(',')), [pool, key])
}
