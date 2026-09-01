import type { Equipment, ExerciseCategory, MuscleGroup } from './types'

/**
 * What the admin form holds while a movement is being written, and what is
 * wrong with it. Kept as strings because that is what inputs give back; the
 * server validates all of it again on arrival
 * (pb_hooks/utils/exercise_validate.js), so this exists to say what is missing
 * before the round trip, not instead of it.
 */

export const MUSCLE_KEYS: MuscleGroup[] = [
  'chest',
  'back',
  'shoulders',
  'biceps',
  'triceps',
  'quads',
  'hamstrings',
  'glutes',
  'calves',
  'core',
  'other',
]

export const EQUIPMENT_KEYS: Equipment[] = [
  'barbell',
  'dumbbell',
  'bodyweight',
  'machine',
  'cable',
  'kettlebell',
  'band',
  'other',
]

export const CATEGORY_KEYS: ExerciseCategory[] = [
  'strength',
  'stretching',
  'cardio',
  'plyometrics',
  'strongman',
  'olympic',
]

export interface ExerciseDraft {
  id: string | null
  name: string
  muscle: string
  equipment: string
  category: string
  /** One step per line, which is how anybody actually types a set of them. */
  instructions: string
  published: boolean
  /** True when the record already carries a picture, so a new file is optional. */
  hasImage: boolean
}

export function blankDraft(): ExerciseDraft {
  return {
    id: null,
    name: '',
    muscle: 'chest',
    equipment: 'barbell',
    category: 'strength',
    instructions: '',
    published: false,
    hasImage: false,
  }
}

export interface ExerciseRecord {
  id: string
  name: string
  muscle: string
  equipment: string
  category: string
  instructions: unknown
  image: string
  published: boolean
}

export function draftFromRecord(row: ExerciseRecord): ExerciseDraft {
  return {
    id: row.id,
    name: row.name,
    muscle: row.muscle,
    equipment: row.equipment,
    category: row.category,
    instructions: stepsOf(row.instructions).join('\n'),
    published: !!row.published,
    hasImage: !!row.image,
  }
}

/**
 * PocketBase hands a json field back as an array, but a hand-written row or an
 * older record can hold the string it was typed as. Both become steps.
 */
export function stepsOf(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((s): s is string => typeof s === 'string').map((s) => s.trim()).filter(Boolean)
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown
      if (Array.isArray(parsed)) return stepsOf(parsed)
    } catch {
      /* Not JSON: treat it as the lines it is. */
    }
    return splitLines(value)
  }
  return []
}

export function splitLines(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

export type DraftProblems = Partial<Record<keyof ExerciseDraft, string>>

/**
 * Every reason this movement cannot be saved yet, keyed by the field that
 * carries it so the form can put the sentence under the input it is about.
 */
export function draftProblems(draft: ExerciseDraft): DraftProblems {
  const problems: DraftProblems = {}
  const name = draft.name.trim()
  if (name.length < 2) problems.name = 'A movement needs a name.'
  else if (name.length > 120) problems.name = 'Too long for a card — 120 characters at most.'

  if (!MUSCLE_KEYS.includes(draft.muscle as MuscleGroup)) problems.muscle = 'Pick a muscle group.'
  if (!EQUIPMENT_KEYS.includes(draft.equipment as Equipment)) problems.equipment = 'Pick the equipment.'
  if (!CATEGORY_KEYS.includes(draft.category as ExerciseCategory)) problems.category = 'Pick a category.'

  const steps = splitLines(draft.instructions)
  if (steps.length > 30) problems.instructions = 'More steps than anybody reads mid-set.'
  else if (steps.some((s) => s.length > 600)) problems.instructions = 'One step is longer than a paragraph.'
  /* Publishing is a promise that the row is finished; drafting is not. */
  else if (draft.published && steps.length === 0) {
    problems.instructions = 'Write at least one step before publishing.'
  }

  return problems
}

export function isSavable(draft: ExerciseDraft): boolean {
  return Object.keys(draftProblems(draft)).length === 0
}
