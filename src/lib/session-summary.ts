import { bestE1rm, epley1rm } from './exercises'
import { workoutTotals } from './stats'
import type { Workout } from './types'

export interface SessionSummary {
  sets: number
  volume: number
  /** Whole minutes between start and finish, or null when either is missing. */
  durationMin: number | null
  /** Exercise ids whose top set beat every earlier session's estimated 1RM. */
  prs: string[]
}

/**
 * What just happened, for the finish celebration card. A first-ever
 * performance is not a record — there was nothing to beat — matching the
 * in-session PR flash semantics.
 */
export function summarizeSession(workout: Workout, earlier: Workout[]): SessionSummary {
  const { sets, volume } = workoutTotals(workout)

  let durationMin: number | null = null
  if (workout.startedAt && workout.endedAt) {
    const ms = Date.parse(workout.endedAt) - Date.parse(workout.startedAt)
    if (Number.isFinite(ms) && ms >= 0) durationMin = Math.round(ms / 60000)
  }

  const prs: string[] = []
  for (const e of workout.exercises) {
    const before = bestE1rm(earlier, e.exerciseId)
    if (before <= 0) continue
    let top = 0
    for (const s of e.sets) top = Math.max(top, epley1rm(s.weight, s.reps))
    if (top > before) prs.push(e.exerciseId)
  }

  return { sets, volume: Math.round(volume), durationMin, prs }
}
