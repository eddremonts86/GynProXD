import { toLocalIso } from './dates'
import type { BodyweightEntry, SetEntry, Workout } from './types'

/** Load moved in one set. Timed holds count their load once, not per second. */
export function setVolume(s: SetEntry): number {
  return s.weight * (s.durationSec ? 1 : s.reps)
}

export function workoutTotals(w: Workout): { sets: number; volume: number } {
  let sets = 0
  let volume = 0
  for (const e of w.exercises)
    for (const s of e.sets) {
      sets += 1
      volume += setVolume(s)
    }
  return { sets, volume }
}

/** Total volume for sessions dated inside [fromIso, toIso], bounds inclusive. */
export function rangeVolume(workouts: Workout[], fromIso: string, toIso: string): number {
  let volume = 0
  for (const w of workouts) {
    if (w.date < fromIso || w.date > toIso) continue
    volume += workoutTotals(w).volume
  }
  return Math.round(volume)
}

export interface WeekPoint {
  /** Monday of the week, local yyyy-mm-dd. */
  start: string
  volume: number
  sets: number
  sessions: number
}

function mondayOf(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return d
}

/**
 * Calendar weeks (Monday-based), oldest first, always exactly `weeks` points so
 * charts keep a stable x-axis even through empty weeks.
 */
export function weeklyVolumeSeries(workouts: Workout[], weeks = 12, today = new Date()): WeekPoint[] {
  const points: WeekPoint[] = []
  const byStart = new Map<string, WeekPoint>()
  const firstMonday = mondayOf(today)
  firstMonday.setDate(firstMonday.getDate() - 7 * (weeks - 1))

  for (let i = 0; i < weeks; i++) {
    const start = new Date(firstMonday)
    start.setDate(firstMonday.getDate() + i * 7)
    const point: WeekPoint = { start: toLocalIso(start), volume: 0, sets: 0, sessions: 0 }
    points.push(point)
    byStart.set(point.start, point)
  }

  const lowest = points[0].start
  for (const w of workouts) {
    if (w.date < lowest) continue
    const [y, m, d] = w.date.split('-').map(Number)
    if (!y || !m || !d) continue
    const point = byStart.get(toLocalIso(mondayOf(new Date(y, m - 1, d))))
    if (!point) continue
    const totals = workoutTotals(w)
    point.volume = Math.round(point.volume + totals.volume)
    point.sets += totals.sets
    point.sessions += 1
  }

  return points
}

/**
 * Times each exercise was performed across all sessions. Feeds the strength
 * chart's exercise ordering, the library's done filter and done-count chips.
 */
export function sessionCountsByExercise(workouts: Workout[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const w of workouts)
    for (const e of w.exercises) counts.set(e.exerciseId, (counts.get(e.exerciseId) ?? 0) + 1)
  return counts
}

/** Signed bodyweight change across the last `days`, or null without two points. */
export function bodyweightDelta(entries: BodyweightEntry[], days: number, today = new Date()): number | null {
  if (entries.length < 2) return null
  const cutoff = new Date(today)
  cutoff.setDate(cutoff.getDate() - days)
  const from = toLocalIso(cutoff)
  const inWindow = entries.filter((e) => e.date >= from).sort((a, b) => a.date.localeCompare(b.date))
  if (inWindow.length < 2) return null
  return Math.round((inWindow[inWindow.length - 1].kg - inWindow[0].kg) * 10) / 10
}
