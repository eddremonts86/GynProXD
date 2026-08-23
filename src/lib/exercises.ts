import { generatedExercises } from '../data/exercises-generated'
import type { Exercise, LoggedExercise, SetEntry, Workout } from './types'

const byIdCache = new Map<string, Exercise>()

export function exerciseLookup(custom: Exercise[]): Map<string, Exercise> {
  const map = new Map<string, Exercise>()
  for (const e of generatedExercises) map.set(e.id, e)
  for (const e of custom) map.set(e.id, e)
  return map
}

export function cachedExercise(id: string, lookup: Map<string, Exercise>): Exercise | undefined {
  return lookup.get(id)
}

export function populateByIdCache(exercises: Exercise[]) {
  for (const e of exercises) byIdCache.set(e.id, e)
}

export function exerciseById(id: string): Exercise | undefined {
  return byIdCache.get(id)
}

export function lastPerformance(
  workouts: Workout[],
  exerciseId: string,
): { date: string; sets: SetEntry[] } | null {
  let best: { date: string; sets: SetEntry[] } | null = null
  for (const w of workouts) {
    const le = w.exercises.find((e) => e.exerciseId === exerciseId && e.sets.length > 0)
    if (!le) continue
    if (!best || w.date > best.date) best = { date: w.date, sets: le.sets }
  }
  return best
}

export function epley1rm(weight: number, reps: number): number {
  if (weight <= 0 || reps <= 0) return 0
  if (reps > 12) return weight
  return weight * (1 + reps / 30)
}

export function bestE1rm(workouts: Workout[], exerciseId: string): number {
  let best = 0
  for (const w of workouts) {
    const le: LoggedExercise | undefined = w.exercises.find((e) => e.exerciseId === exerciseId)
    if (!le) continue
    for (const s of le.sets) {
      best = Math.max(best, epley1rm(s.weight, s.reps))
    }
  }
  return best
}

export function e1rmSeries(workouts: Workout[], exerciseId: string): { date: string; e1rm: number }[] {
  const sorted = [...workouts].sort((a, b) => a.date.localeCompare(b.date))
  const series: { date: string; e1rm: number }[] = []
  for (const w of sorted) {
    const le = w.exercises.find((e) => e.exerciseId === exerciseId)
    if (!le || le.sets.length === 0) continue
    let best = 0
    for (const s of le.sets) best = Math.max(best, epley1rm(s.weight, s.reps))
    if (best > 0) series.push({ date: w.date, e1rm: Math.round(best * 10) / 10 })
  }
  return series
}

export const BODYWEIGHT_EQUIPMENT = new Set(['bodyweight'])

export function isBodyweight(exercise: Exercise | undefined): boolean {
  return !!exercise && BODYWEIGHT_EQUIPMENT.has(exercise.equipment)
}
