import { todayIso, toLocalIso } from './dates'
import { IMPORT_DAYS } from './life-profile'

/**
 * Which days `/day` will draw, and how to step between them.
 *
 * The screen used to draw today and only today, which was fine until the rest
 * of the phase gave it things to say about other days: a connected calendar
 * reads three weeks ahead, and an outing added from the events strip is usually
 * next Friday rather than tonight. Both were being stored and neither could be
 * looked at.
 *
 * **Today to today plus three weeks.** The far end is `IMPORT_DAYS`, the same
 * window every calendar import already reads, so the screen can never offer a
 * day it has no data for. The near end is today, because a day plan is a plan:
 * what happened yesterday is History's, and a planner that let somebody arrange
 * a past afternoon would be inviting them to edit something that already
 * happened.
 *
 * Everything here is pure and takes today as an argument, so the tests do not
 * depend on the clock and the screen has one place to be wrong about dates.
 */

/** How far ahead the day may be looked at. The calendar's own window. */
export const DAYS_AHEAD = IMPORT_DAYS

const ISO = /^\d{4}-\d{2}-\d{2}$/

/** A date shifted by whole days, staying local. Invalid in, today out. */
export function isoPlusDays(iso: string, days: number, today = todayIso()): string {
  if (!ISO.test(iso)) return today
  const [y, m, d] = iso.split('-').map(Number)
  const at = new Date(y, m - 1, d)
  if (Number.isNaN(at.getTime())) return today
  at.setDate(at.getDate() + days)
  return toLocalIso(at)
}

/** The last day the screen will draw. */
export function lastDay(today = todayIso()): string {
  return isoPlusDays(today, DAYS_AHEAD, today)
}

/** Whether this date is one the screen is willing to draw. */
export function isWithinWindow(iso: string, today = todayIso()): boolean {
  return ISO.test(iso) && iso >= today && iso <= lastDay(today)
}

/**
 * The date to actually draw.
 *
 * Anything outside the window becomes today rather than an error, because the
 * only ways to get here with a bad one are a hand-edited URL and a tab left
 * open overnight — and the second is the common one. Somebody who leaves
 * `/day?d=<yesterday>` open and comes back to it should find today, not a
 * refusal.
 */
export function clampDay(iso: string | undefined, today = todayIso()): string {
  if (!iso || !ISO.test(iso)) return today
  if (iso < today) return today
  const last = lastDay(today)
  return iso > last ? last : iso
}

/** The next or previous day within the window, or null when there is not one. */
export function stepDay(iso: string, days: number, today = todayIso()): string | null {
  const next = isoPlusDays(clampDay(iso, today), days, today)
  return isWithinWindow(next, today) ? next : null
}

/** "Today", "Tomorrow", or nothing, for the label beside the date. */
export function relativeDayLabel(iso: string, today = todayIso()): string | null {
  if (iso === today) return 'Today'
  if (iso === isoPlusDays(today, 1, today)) return 'Tomorrow'
  return null
}
