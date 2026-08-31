/**
 * The teaching layer for the 601 movements RepDB covers: Spanish text, coaching
 * tips, MET values, difficulty and mechanics.
 *
 * It lives outside `exercises-generated.ts` on purpose. The catalogue is
 * imported eagerly by the generator, the swap list and the search box, so
 * everything in it is downloaded before the first screen paints; this file is
 * nearly a megabyte and nothing needs it to render a plan. Hence the dynamic
 * import — Vite emits it as its own chunk, fetched the first time something
 * actually asks for a movement's detail, and cached for the rest of the session.
 *
 * Coverage is partial by nature: free-exercise-db movements RepDB does not
 * cover return null, and callers must render without them rather than wait.
 */

export type ExerciseDifficulty = 'beginner' | 'intermediate' | 'advanced'
export type ExerciseMechanic = 'compound' | 'isolation'
export type ExerciseForce = 'push' | 'pull' | 'static' | 'dynamic'
export type ExerciseGoal =
  | 'strength'
  | 'hypertrophy'
  | 'endurance'
  | 'power'
  | 'mobility'
  | 'rehabilitation'
  | 'core'

export interface ExerciseDetail {
  source: 'repdb'
  /** The upstream id, which is also the illustration filename stem. */
  repdbId: string
  nameEs: string
  descriptionEn: string
  descriptionEs: string
  instructionsEs: string[]
  tipsEn: string[]
  tipsEs: string[]
  /**
   * Metabolic equivalent of task, 1.3 to 11.8 across the set. Energy cost is
   * roughly `met × bodyweightKg × hours`, which is the honest way to put a
   * calorie figure on a session instead of guessing one.
   */
  met: number
  difficulty: ExerciseDifficulty
  mechanic: ExerciseMechanic
  force: ExerciseForce
  goals: ExerciseGoal[]
  /** RepDB's own anatomical vocabulary (`gluteus_medius`), not the app's muscle groups. */
  secondaryMuscles: string[]
  unilateral: boolean
}

let details: Record<string, ExerciseDetail> | null = null
let pending: Promise<Record<string, ExerciseDetail>> | null = null

/** The whole map. Concurrent callers share one fetch. */
export function loadExerciseDetails(): Promise<Record<string, ExerciseDetail>> {
  if (details) return Promise.resolve(details)
  pending ??= import('../data/exercise-details-generated.json').then((module) => {
    details = module.default as Record<string, ExerciseDetail>
    return details
  })
  return pending
}

/** Null for movements RepDB does not cover — roughly half the catalogue. */
export async function exerciseDetail(id: string): Promise<ExerciseDetail | null> {
  return (await loadExerciseDetails())[id] ?? null
}

/**
 * Synchronous read for callers already past an `await loadExerciseDetails()`
 * (a rendered list, say, where an await per row would stagger the paint).
 * Returns null until the chunk has landed.
 */
export function exerciseDetailSync(id: string): ExerciseDetail | null {
  return details?.[id] ?? null
}
