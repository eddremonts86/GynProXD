import type { DayOfWeek } from './types'

/**
 * The hours somebody does not control, and the window they are awake in.
 *
 * This is the only new thing a member has to tell us for the day planner to
 * work, and it is deliberately the smallest possible thing: when you get up,
 * when you go to bed, and the blocks in between that are already taken. The
 * planner arranges what the app already knows around those, and it invents
 * nothing.
 *
 * Times are local wall-clock `HH:MM` strings, not instants. A day plan is a
 * thing you read on a Tuesday morning, so a timezone on it would be precision
 * about the wrong quantity: the point of "school run at 08:30" is that it is
 * half eight wherever the person happens to be.
 */

export type AnchorKind = 'work' | 'care' | 'travel' | 'fixed' | 'busy'

export interface Anchor {
  id: string
  /** What it is, in their words. "work", "school run", "the commute". */
  label: string
  days: DayOfWeek[]
  /** `HH:MM`, local. */
  start: string
  end: string
  kind: AnchorKind
  /** Set when it came from an imported calendar rather than from a person. */
  source?: 'ics'
}

/**
 * Busy time on one date, from a calendar.
 *
 * Not an anchor, and the difference is the whole reason this type exists. An
 * anchor is a weekly pattern somebody described: work, every weekday, nine to
 * five. A real calendar is mostly one-off appointments on named dates, and
 * those are the ones a day planner has to avoid to be trusted at all — a
 * planner that puts your session inside Thursday's meeting gets closed and not
 * reopened.
 *
 * `label` is optional because the import decides whether to keep it. Reading a
 * file somebody picked is not a privacy event; storing "oncology follow-up" in
 * a synced record is a different question, and it is theirs to answer.
 */
export interface BusyBlock {
  id: string
  /** yyyy-mm-dd, local. */
  date: string
  /** `HH:MM`, local. */
  start: string
  end: string
  label?: string
  /**
   * Which door it came in by.
   *
   * `ics` is a file somebody picked, added to whatever is already there.
   * `google`, `apple` and `microsoft` are connected calendars, which are
   * mirrors rather than imports: a pull replaces every block from that provider
   * and leaves the others alone, because the calendar is the truth and a
   * meeting that was moved there has to move here.
   */
  source: 'ics' | 'google' | 'apple' | 'microsoft'
}

/**
 * How far ahead a calendar is read, and how many blocks are ever held.
 *
 * The profile is one synced record with arrays inside it, so it is not the
 * place for a decade of anybody's meetings. Three weeks is wider than the day
 * planner ever looks and narrow enough that the record stays small; past dates
 * are dropped on every import rather than accumulating.
 */
export const IMPORT_DAYS = 21
export const MAX_BUSY = 200

/**
 * Where "near you" means, remembered so the strip does not ask twice.
 *
 * A five kilometre cell from the browser's position, or a city typed by hand,
 * never both. `label` is what the screen says: "Around you", or the city as
 * they spelled it. Nothing finer than the cell is ever held.
 */
export interface Place {
  geo?: string
  city?: string
  label: string
}

/**
 * A ticketed event they added to a day.
 *
 * Not a `BusyBlock`: that is time a calendar took, drawn hatched. This is
 * somewhere they chose to be, drawn as an event with a link to the tickets, and
 * a commitment in the planner's sense: the session moves around it, never the
 * other way. `id` is the vendor's, so the same event is not held twice.
 */
export interface Outing {
  id: string
  label: string
  /** yyyy-mm-dd, then `HH:MM` twice. */
  date: string
  start: string
  end: string
  venue?: string
  /** https only. */
  url?: string
}
export const MAX_OUTINGS = 50

export interface LifeProfile {
  anchors: Anchor[]
  /** Dated busy time, from an imported calendar. See `BusyBlock`. */
  busy?: BusyBlock[]
  /** `HH:MM`. Absent falls back to WAKE_DEFAULT. */
  wake?: string
  sleep?: string
  /**
   * The hour they would rather train.
   *
   * Absent is not "no opinion recorded", it is "put it wherever it fits", and
   * that is the better default: somebody who has not said should get the
   * biggest hole in their day rather than an arbitrary hour. Set, it becomes a
   * preference the placer aims at and still only among gaps the session fits.
   */
  trainAt?: string
  /** The hour their main meal wants to be near. Absent falls back to MEAL_HOUR. */
  mealAt?: string
  /**
   * Everything they typed about their week, verbatim, the way
   * `OnboardingInput.constraints` is. The only channel for what the fields
   * above cannot hold, and what the companion reads.
   */
  notes?: string
  /** Where "near you" means. See `Place`. */
  place?: Place
  /** Ticketed events they are going to. See `Outing`. */
  outings?: Outing[]
  updatedAt: string
}

/**
 * Seven and eleven. Not a claim about anybody, just a starting point that puts
 * a sixteen hour day on screen instead of an empty one, and both ends are
 * editable on the first screen that shows them.
 */
export const WAKE_DEFAULT = '07:00'
export const SLEEP_DEFAULT = '23:00'

export const MAX_LABEL = 40
export const MINUTES_IN_DAY = 24 * 60

const CLOCK = /^([01]\d|2[0-3]):([0-5]\d)$/

/** Minutes since local midnight, or null when it is not a clock time. */
export function minutesOf(clock: string): number | null {
  const match = CLOCK.exec(String(clock ?? '').trim())
  if (!match) return null
  return Number(match[1]) * 60 + Number(match[2])
}

/** `HH:MM` from minutes since midnight. 1440 is midnight at the far end. */
export function clockOf(minutes: number): string {
  const total = Math.max(0, Math.min(MINUTES_IN_DAY, Math.round(minutes)))
  const h = Math.floor(total / 60) % 24
  const m = total % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export interface AnchorProblem {
  field: 'label' | 'days' | 'start' | 'end'
  message: string
}

/**
 * What is wrong with this anchor, in words somebody can act on.
 *
 * An anchor whose end is before its start is refused rather than wrapped. A
 * night shift is two anchors, one each side of midnight, and that is a truer
 * description of it than one block with a fold in the middle: the planner works
 * a day at a time, and half of a wrapped anchor belongs to a different day's
 * free time. Wrapping it silently would put a shift worker's evening in the
 * wrong day and never say so.
 *
 * ponytail: no wrap handling. Two anchors covers it; revisit if somebody
 * actually asks to enter one block across midnight.
 */
export function anchorProblems(anchor: Partial<Anchor>): AnchorProblem[] {
  const problems: AnchorProblem[] = []
  if (!String(anchor.label ?? '').trim()) {
    problems.push({ field: 'label', message: 'Give it a name, so the day reads like yours.' })
  }
  if (!anchor.days || anchor.days.length === 0) {
    problems.push({ field: 'days', message: 'Pick at least one day.' })
  }
  const start = minutesOf(anchor.start ?? '')
  const end = minutesOf(anchor.end ?? '')
  if (start === null) problems.push({ field: 'start', message: 'Needs a time like 08:30.' })
  if (end === null) problems.push({ field: 'end', message: 'Needs a time like 17:00.' })
  if (start !== null && end !== null && end <= start) {
    problems.push({
      field: 'end',
      message: 'Has to finish after it starts. Something that runs past midnight is two entries.',
    })
  }
  return problems
}

export function isValidAnchor(anchor: Partial<Anchor>): anchor is Anchor {
  return anchorProblems(anchor).length === 0
}

/** A range in minutes since midnight, half-open: `[start, end)`. */
export interface Span {
  start: number
  end: number
}

/**
 * The anchors that apply to one weekday, as spans, clipped to the waking
 * window and merged where they touch or overlap.
 *
 * Merging matters more than it looks. Two anchors that abut leave a zero-length
 * gap between them, and a zero-length gap that reaches the placer is a slot
 * with no duration on somebody's screen. Doing it here means the placer only
 * ever sees real free time.
 */
export function busySpans(anchors: readonly Anchor[], day: DayOfWeek, window: Span): Span[] {
  const spans: Span[] = []
  for (const anchor of anchors) {
    if (!anchor.days.includes(day)) continue
    const start = minutesOf(anchor.start)
    const end = minutesOf(anchor.end)
    if (start === null || end === null || end <= start) continue
    const clipped = { start: Math.max(start, window.start), end: Math.min(end, window.end) }
    if (clipped.end > clipped.start) spans.push(clipped)
  }
  return mergeSpans(spans)
}

/**
 * Sorted, with anything touching or overlapping folded into one.
 *
 * Its own function because two sources feed the placer now — weekly anchors and
 * dated calendar blocks — and merging each list separately would leave the
 * seam between them unmerged. A zero-length gap between an anchor and a meeting
 * that starts the moment it ends is a slot with no duration on somebody's day.
 */
export function mergeSpans(spans: readonly Span[]): Span[] {
  const sorted = [...spans].sort((a, b) => a.start - b.start || a.end - b.end)
  const merged: Span[] = []
  for (const span of sorted) {
    const last = merged[merged.length - 1]
    if (last && span.start <= last.end) last.end = Math.max(last.end, span.end)
    else merged.push({ ...span })
  }
  return merged
}

/** The calendar blocks on one date, as spans clipped to the waking window. */
export function datedSpans(
  busy: readonly BusyBlock[] | undefined,
  date: string,
  window: Span,
): Span[] {
  const spans: Span[] = []
  for (const block of busy ?? []) {
    if (block.date !== date) continue
    const start = minutesOf(block.start)
    const end = minutesOf(block.end)
    if (start === null || end === null || end <= start) continue
    const clipped = { start: Math.max(start, window.start), end: Math.min(end, window.end) }
    if (clipped.end > clipped.start) spans.push(clipped)
  }
  return mergeSpans(spans)
}

/** The waking window, from the profile, with both ends defaulted and ordered. */
export function wakingWindow(profile: Pick<LifeProfile, 'wake' | 'sleep'>): Span {
  const wake = minutesOf(profile.wake ?? '') ?? minutesOf(WAKE_DEFAULT)!
  const sleep = minutesOf(profile.sleep ?? '') ?? minutesOf(SLEEP_DEFAULT)!
  /* A bedtime at or before the alarm is somebody who works nights, and the
     honest reading is that they are awake until midnight rather than for
     negative hours. The far end of the day is 24:00 and the planner has no
     opinion about what happens after it. */
  return sleep > wake ? { start: wake, end: sleep } : { start: wake, end: MINUTES_IN_DAY }
}

/** Free time inside the window, in the order the day runs. */
export function freeSpans(busy: readonly Span[], window: Span): Span[] {
  const gaps: Span[] = []
  let cursor = window.start
  for (const span of busy) {
    if (span.start > cursor) gaps.push({ start: cursor, end: span.start })
    cursor = Math.max(cursor, span.end)
  }
  if (cursor < window.end) gaps.push({ start: cursor, end: window.end })
  return gaps
}

export function emptyLifeProfile(now = new Date()): LifeProfile {
  return { anchors: [], updatedAt: now.toISOString() }
}
