import { seedFrom } from './seed'
import type { RecipeSuggestion } from './recipes'

/**
 * One plate per training day, drawn from a pool that already fits the
 * member's meal window. Seeded by the date, so a day keeps its dish across
 * devices and reloads, and distinct within the batch, so a week never serves
 * the same thing three times. When the pool is smaller than the week it
 * starts over rather than leaving days empty.
 */
export function pickPerDay(
  pool: RecipeSuggestion[],
  dates: string[],
): Record<string, RecipeSuggestion> {
  if (pool.length === 0) return {}
  const picks: Record<string, RecipeSuggestion> = {}
  let remaining = [...pool]
  for (const date of dates) {
    if (remaining.length === 0) remaining = [...pool]
    const index = seedFrom(date) % remaining.length
    picks[date] = remaining[index]
    remaining.splice(index, 1)
  }
  return picks
}
