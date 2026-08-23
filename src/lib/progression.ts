import type { Exercise, ProgressionRule, SetEntry, Workout } from './types'
import { bestE1rm, epley1rm, isBodyweight, lastPerformance } from './exercises'

export type { ProgressionRule }

export const DEFAULT_REP_RANGE: [number, number] = [8, 12]

export interface Suggestion {
  weight: number
  reps: number
  reason: string
}

const KG_STEP_BARBELL = 2.5

function topSet(sets: SetEntry[]): SetEntry | null {
  if (sets.length === 0) return null
  return sets.reduce((a, b) => (epley1rm(b.weight, b.reps) > epley1rm(a.weight, a.reps) ? b : a))
}

export function suggestNext(
  rule: ProgressionRule,
  exercise: Exercise | undefined,
  workouts: Workout[],
): Suggestion | null {
  const last = lastPerformance(workouts, exercise?.id ?? '')
  if (!rule || rule === 'none' || !exercise || !last || last.sets.length === 0) return null

  const top = topSet(last.sets)
  if (!top || top.reps <= 0) return null

  if (isBodyweight(exercise)) {
    const reps = top.reps + 1
    return {
      weight: 0,
      reps,
      reason: `bodyweight: +1 rep over last time (${top.reps})`,
    }
  }

  if (rule === 'linear') {
    return {
      weight: round(top.weight + KG_STEP_BARBELL),
      reps: top.reps,
      reason: `linear: +${KG_STEP_BARBELL}kg from ${top.weight}×${top.reps}`,
    }
  }

  const [minReps, maxReps] = DEFAULT_REP_RANGE
  const allSetsInRangeOrAbove = last.sets.every((s) => s.reps >= maxReps)
  if (allSetsInRangeOrAbove) {
    return {
      weight: round(top.weight + KG_STEP_BARBELL),
      reps: minReps,
      reason: `double progression: hit ${last.sets.length}×${maxReps} at ${top.weight}kg → +${KG_STEP_BARBELL}kg`,
    }
  }
  const targetReps = Math.min(maxReps, Math.max(minReps, top.reps))
  return {
    weight: top.weight,
    reps: targetReps,
    reason:
      top.reps < minReps
        ? `double progression: stay at ${top.weight}kg, build reps (${top.reps} → ${targetReps})`
        : `double progression: same weight, push reps to ${maxReps}`,
  }
}

export function isPersonalRecord(
  exerciseId: string,
  set: SetEntry,
  pastWorkouts: Workout[],
  currentWorkoutSets: SetEntry[],
): boolean {
  const candidate = epley1rm(set.weight, set.reps)
  if (candidate <= 0) return false
  const pastBest = bestE1rm(pastWorkouts, exerciseId)
  const currentBest = Math.max(0, ...currentWorkoutSets.map((s) => epley1rm(s.weight, s.reps)))
  return candidate > pastBest && candidate >= currentBest
}

function round(n: number): number {
  return Math.round(n * 10) / 10
}
