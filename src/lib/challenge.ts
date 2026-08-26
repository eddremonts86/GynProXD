import { toLocalIso } from './dates'

/**
 * A 30-day single-movement challenge: one exercise, a rep (or seconds)
 * count per day, ascending or counting down. Definitions are plain data —
 * bundled with the app or published by a gym on the message bus. A member's
 * progress is private and lives in the encrypted profile snapshot as an
 * ActiveChallenge, which carries a full definition copy so the card
 * survives the source message being deleted.
 */

export interface Challenge {
  id: string
  name: string
  exerciseId: string
  days: number
  /** Reps (or seconds) on day 1. */
  start: number
  /** Daily change; negative for countdowns. Day counts never drop below 1. */
  delta: number
  unit: 'reps' | 'seconds'
  blurb?: string
}

export interface ActiveChallenge {
  challenge: Challenge
  /** ISO date of day 1. */
  startedAt: string
  /** ISO dates (of the challenge day, not the tap) marked complete. */
  completedDays: string[]
}

export function repsForDay(c: Challenge, day: number): number {
  return Math.max(1, c.start + c.delta * (day - 1))
}

export function totalReps(c: Challenge): number {
  let total = 0
  for (let d = 1; d <= c.days; d++) total += repsForDay(c, d)
  return total
}

export function dateForDay(state: ActiveChallenge, day: number): string {
  const [y, m, d] = state.startedAt.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  date.setDate(date.getDate() + (day - 1))
  return toLocalIso(date)
}

export interface ChallengeDay {
  day: number
  reps: number
  dateIso: string
  done: boolean
  isToday: boolean
  /** Days that already passed unmarked. Tappable — catching up is allowed. */
  missed: boolean
  future: boolean
}

export function challengeCalendar(state: ActiveChallenge, todayIso: string): ChallengeDay[] {
  const done = new Set(state.completedDays)
  const out: ChallengeDay[] = []
  for (let day = 1; day <= state.challenge.days; day++) {
    const dateIso = dateForDay(state, day)
    const isDone = done.has(dateIso)
    out.push({
      day,
      reps: repsForDay(state.challenge, day),
      dateIso,
      done: isDone,
      isToday: dateIso === todayIso,
      missed: !isDone && dateIso < todayIso,
      future: dateIso > todayIso,
    })
  }
  return out
}

export function isChallengeComplete(state: ActiveChallenge): boolean {
  return new Set(state.completedDays).size >= state.challenge.days
}

/** Consecutive completed days ending today or yesterday, the habit metric. */
export function challengeStreak(state: ActiveChallenge, todayIso: string): number {
  const done = new Set(state.completedDays)
  const calendar = challengeCalendar(state, todayIso)
  let streak = 0
  for (let i = calendar.length - 1; i >= 0; i--) {
    const d = calendar[i]
    if (d.future) continue
    if (d.isToday && !done.has(d.dateIso)) continue
    if (done.has(d.dateIso)) streak++
    else break
  }
  return streak
}
