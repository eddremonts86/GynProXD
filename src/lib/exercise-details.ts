/**
 * The teaching layer over the catalogue: step-by-step instructions in ten
 * languages, coaching tips, MET values, difficulty and mechanics.
 *
 * It lives outside `exercises-generated.ts` on purpose. The catalogue is
 * imported eagerly by the generator, the swap list and the search box, so
 * everything in it is downloaded before the first screen paints; this file is
 * megabytes and nothing needs it to render a plan. Hence the dynamic import —
 * Vite emits it as its own chunk, fetched the first time something asks for a
 * movement's detail and cached for the rest of the session. It is also kept out
 * of the service worker's precache, so installing the app does not cost a
 * viewer a translation set they may never open.
 *
 * Coverage is partial in two different ways, and callers must survive both:
 * roughly half the catalogue has a record at all, and a record may carry only
 * some of the languages.
 */

import languageIndex from '../data/exercise-languages.json'

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

/**
 * `es` comes from RepDB where it exists — written against the illustration we
 * ship — and from the translated set otherwise. The rest are the translated
 * set's alone.
 */
export type InstructionLanguage =
  | 'en'
  | 'es'
  | 'fr'
  | 'it'
  | 'pl'
  | 'tr'
  | 'ru'
  | 'zh'
  | 'hi'
  | 'ko'

export interface ExerciseDetail {
  /** Which upstreams contributed. A record may hold translations and nothing else. */
  sources: ('repdb' | 'exercises-dataset')[]
  instructions: Partial<Record<InstructionLanguage, string[]>>
  /** Present only on the 601 movements RepDB covers. */
  repdbId?: string
  nameEs?: string
  descriptionEn?: string
  descriptionEs?: string
  tipsEn?: string[]
  tipsEs?: string[]
  /**
   * Metabolic equivalent of task, 1.3 to 11.8 across the set. Energy cost is
   * roughly `met × bodyweightKg × hours`, which is the honest way to put a
   * calorie figure on a session instead of guessing one.
   */
  met?: number
  difficulty?: ExerciseDifficulty
  mechanic?: ExerciseMechanic
  force?: ExerciseForce
  goals?: ExerciseGoal[]
  /** RepDB's own anatomical vocabulary (`gluteus_medius`), not the app's muscle groups. */
  secondaryMuscles?: string[]
  unilateral?: boolean
}

/**
 * Which languages a movement has, without the text. Fifty kilobytes against the
 * detail chunk's six hundred, and it is what lets the movement dialog offer
 * Spanish before anyone has downloaded a word of it.
 */
const languages = languageIndex as Record<string, InstructionLanguage[]>

/** Empty for movements no upstream translated. Cheap: no chunk is fetched. */
export function exerciseLanguages(exerciseId: string): InstructionLanguage[] {
  return languages[exerciseId] ?? []
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

/** Null for movements no upstream covers — roughly half the catalogue. */
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

/**
 * Instructions in the requested language, falling back to English and then to
 * whatever the record actually has. Returns null rather than an empty array so
 * a caller can tell "nothing to show" from "a movement with no steps".
 */
export function instructionsIn(
  detail: ExerciseDetail | null,
  language: InstructionLanguage,
): string[] | null {
  if (!detail) return null
  const steps = detail.instructions[language] ?? detail.instructions.en
  if (steps?.length) return steps
  const any = Object.values(detail.instructions).find((s) => s.length > 0)
  return any ?? null
}
