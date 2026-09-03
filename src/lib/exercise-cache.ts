import type { Exercise } from './types'

/**
 * The id → movement lookup, kept apart from the catalogue on purpose.
 *
 * `lib/exercises` owns the bundled catalogue and seeds this cache when it
 * loads, so every surface that renders a movement name gets a populated cache
 * for free. The store imports this module instead of that one so a visitor who
 * never signs in does not download 240 KB of movements to read the landing.
 */
const byIdCache = new Map<string, Exercise>()

export function populateByIdCache(exercises: Exercise[]) {
  for (const e of exercises) byIdCache.set(e.id, e)
}

export function exerciseById(id: string): Exercise | undefined {
  return byIdCache.get(id)
}
