import { generatedExercises } from '../data/exercises-generated'
import type { Exercise } from './types'

/**
 * "The rack is busy" / "that hurts today" — swap a movement without leaving
 * the session. Candidates share the target muscle; the ranking prefers a
 * different implement (the usual reason to swap is equipment, not muscle)
 * while keeping bodyweight options near the top, since they are always
 * available. Pure and offline over the bundled catalogue.
 */

const BODYWEIGHT: Exercise['equipment'][] = ['bodyweight', 'band']

export interface AlternativeOptions {
  /** Exclude movements already in the session; swapping into a duplicate is noise. */
  exclude?: string[]
  limit?: number
}

export function alternativesFor(
  exercise: Pick<Exercise, 'id' | 'muscle' | 'equipment'>,
  options: AlternativeOptions = {},
): Exercise[] {
  const { exclude = [], limit = 6 } = options
  const skip = new Set([exercise.id, ...exclude])

  const scored = generatedExercises
    .filter((e) => e.muscle === exercise.muscle && !skip.has(e.id))
    .map((e) => {
      let score = 0
      if (e.equipment !== exercise.equipment) score += 2
      if (BODYWEIGHT.includes(e.equipment)) score += 3
      if ((e.instructions?.length ?? 0) > 0) score += 1
      return { exercise: e, score }
    })

  /* Name is the tiebreaker so the list is stable across renders. */
  scored.sort((a, b) => b.score - a.score || a.exercise.name.localeCompare(b.exercise.name))
  return scored.slice(0, limit).map((s) => s.exercise)
}
