import { generatedExercises } from '../data/exercises-generated'
import { seedFrom } from './seed'
import type { Exercise } from './types'

/**
 * The daily movement spotlight over the bundled catalogue. Pure and
 * offline: no store, no network, every device converges on the same pick.
 * Only movements with instructions qualify — the card exists to teach.
 */

let cached: Exercise[] | null = null

export function teachablePool(): Exercise[] {
  cached ??= generatedExercises.filter((e) => (e.instructions?.length ?? 0) > 0)
  return cached
}

export function exerciseOfTheDay(dateIso: string): Exercise {
  const pool = teachablePool()
  return pool[seedFrom(dateIso) % pool.length]
}

/** A random movement; the RNG is injected so specs can pin the outcome. */
export function surpriseExercise(random: () => number = Math.random): Exercise {
  const pool = teachablePool()
  const index = Math.min(pool.length - 1, Math.floor(random() * pool.length))
  return pool[Math.max(0, index)]
}
