import type { Exercise } from './types'

/**
 * What a movement is like, inferred from the catalogue instead of asked of
 * the member. A barbell squat has no left and right side; a plank is not
 * counted in reps; a treadmill is neither. Making people flag that by hand
 * on 1,322 movements is a chore nobody will do, and the cost of not doing it
 * is a session that asks nonsense questions.
 *
 * The plan can still force either flag on — someone may want a timed set of
 * something ordinarily counted — but nothing here has to be configured for
 * the common case to be right.
 */

/** "One-arm", "single-leg", "alternating": worked a side at a time. */
const UNILATERAL = /\b(one[- ]arm|single[- ]arm|one[- ]leg|single[- ]leg|alternating|unilateral)\b/i

/** Holds, stretches and steady-state cardio are measured in seconds. */
const TIMED = /\b(plank|hold|isometric|wall sit|stretch|treadmill|rowing|running|cycling|elliptical|stationary|jump rope|skipping)\b/i

export function isUnilateralByNature(exercise: Pick<Exercise, 'name'> | undefined): boolean {
  return !!exercise && UNILATERAL.test(exercise.name)
}

export function isTimedByNature(exercise: Pick<Exercise, 'name'> | undefined): boolean {
  return !!exercise && TIMED.test(exercise.name)
}

/**
 * Cardio and stretching carry no external load by default, so asking for
 * kilos first is noise. The field stays available — people do wear a vest —
 * but it stops blocking the log.
 */
export function loadIsOptional(exercise: Pick<Exercise, 'name' | 'equipment'> | undefined): boolean {
  if (!exercise) return false
  return exercise.equipment === 'bodyweight' || isTimedByNature(exercise)
}
