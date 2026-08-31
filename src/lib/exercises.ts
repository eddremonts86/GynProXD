import { generatedExercises } from '../data/exercises-generated'
import { wgerExercises } from '../data/exercises-wger-generated'
import { artworkRank } from './images'
import type { Exercise, LoggedExercise, SetEntry, Workout } from './types'

const byIdCache = new Map<string, Exercise>()

/**
 * Everything a member can browse, search or put in a session: the bundled
 * catalogue, the CC-BY-SA movements wger contributes, whatever the platform
 * has written since the last release, and their own.
 *
 * `server` is passed in rather than read from the store so this stays a pure
 * function of its arguments — the specs and the plan generator depend on that.
 *
 * The plan generator deliberately does not use this — it draws from
 * `generatedExercises` alone. Share-alike attribution has to be rendered
 * wherever the text is shown, and a generated programme prints movement names
 * across a dozen screens; keeping wger to the surfaces a person navigates to
 * on purpose keeps that credit somewhere it can actually be read.
 */
export function exerciseLookup(custom: Exercise[], server: Exercise[] = []): Map<string, Exercise> {
  const map = new Map<string, Exercise>()
  for (const e of generatedExercises) map.set(e.id, e)
  for (const e of wgerExercises) map.set(e.id, e)
  for (const e of server) map.set(e.id, e)
  for (const e of custom) map.set(e.id, e)
  return map
}

/**
 * Browse order for the library: our own artwork, then wger's, then the
 * movements with none. Alphabetical inside each band.
 *
 * A grid where every third card is a typographic tile reads as a broken page
 * rather than a catalogue, and 529 of the 2,076 movements have no picture at
 * all. Sinking those was the first half of the fix. The second is that wger's
 * images are contributor uploads of uneven kind — mostly clean line drawings,
 * but also logos and captioned composites — so they sit below the 1,547
 * movements that share one visual language rather than interleaved with them.
 *
 * Nothing is hidden: everything stays searchable, filterable and usable, and
 * the bands hold inside every filter because the order is applied before the
 * list is filtered rather than after.
 *
 * Ranked into a map first: `artworkRank` is cheap, but a comparator would ask
 * it O(n log n) times over two thousand movements.
 */
export function libraryOrder(exercises: Exercise[]): Exercise[] {
  const rank = new Map(exercises.map((e) => [e.id, artworkRank(e)]))
  return [...exercises].sort(
    (a, b) => (rank.get(a.id) ?? 2) - (rank.get(b.id) ?? 2) || a.name.localeCompare(b.name),
  )
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

export interface PersonalRecord {
  exerciseId: string
  e1rm: number
  weight: number
  reps: number
  date: string
}

/**
 * The most recent set that beat a movement's previous best estimated 1RM.
 * A first-ever lift is not a record (there was nothing to beat), and bodyweight
 * sets score zero, so only loaded progress surfaces. Returns null until a real
 * PR exists — the widget that shows it simply is not there before then.
 */
export function latestPersonalRecord(workouts: Workout[]): PersonalRecord | null {
  const sorted = [...workouts].sort((a, b) =>
    (a.startedAt ?? a.date).localeCompare(b.startedAt ?? b.date),
  )
  const best = new Map<string, number>()
  let latest: PersonalRecord | null = null
  for (const w of sorted) {
    for (const le of w.exercises) {
      const prior = best.get(le.exerciseId) ?? 0
      let topE = 0
      let topSet: { weight: number; reps: number } | null = null
      for (const s of le.sets) {
        const e = epley1rm(s.weight, s.reps)
        if (e > topE) {
          topE = e
          topSet = s
        }
      }
      if (topSet && topE > prior) {
        if (prior > 0) {
          latest = {
            exerciseId: le.exerciseId,
            e1rm: Math.round(topE * 10) / 10,
            weight: topSet.weight,
            reps: topSet.reps,
            date: w.date,
          }
        }
        best.set(le.exerciseId, topE)
      }
    }
  }
  return latest
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
