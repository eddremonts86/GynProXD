import type { DayOfWeek } from './types'
import {
  busySpans,
  clockOf,
  freeSpans,
  minutesOf,
  wakingWindow,
  type LifeProfile,
  type Span,
} from './life-profile'

/**
 * One day, arranged. Pure arithmetic over the hours somebody does not control.
 *
 * The rule that decides every question in this file: **the scheduler arranges,
 * it does not invent.** Everything placed here already exists somewhere else in
 * the app — the training day comes from the planner, the plate from the recipe
 * catalogue, the challenge from a challenge already running. Nothing is
 * generated, nothing is suggested, and no language model is involved. That is
 * what makes the output checkable, and it is why this file has no IO and no
 * clock of its own beyond the date it is handed.
 *
 * It also does not fill the day. A schedule with no white space in it is a
 * schedule nobody follows, and this product's voice is factual rather than
 * motivational, so free time is left free and the timeline draws it as space.
 * There is no `rest` slot: an empty hour is not an activity.
 */

export type SlotKind = 'anchor' | 'training' | 'meal' | 'challenge'

export interface DaySlot {
  /** `HH:MM`, local. */
  start: string
  end: string
  kind: SlotKind
  label: string
  /**
   * What it points at: an anchor id, a plan id, a recipe id. The screen uses it
   * to link out; nothing in here interprets it.
   */
  ref?: string
  /** The member moved or kept this one on purpose. See `DayPlan`. */
  pinned?: boolean
}

export interface DayPlan {
  /** yyyy-mm-dd. */
  date: string
  slots: DaySlot[]
  /**
   * What did not fit, so a screen can say so instead of quietly dropping it.
   *
   * This is the honest half of the output and the reason it is returned rather
   * than logged: a member whose Tuesday has no ninety-minute hole in it should
   * be told that, not shown a day with the session mysteriously absent.
   */
  unplaced: Exclude<SlotKind, 'anchor'>[]
  generatedAt: string
}

/** Half an hour to eat, a quarter of an hour for a challenge day. */
export const MEAL_MINUTES = 30
export const CHALLENGE_MINUTES = 15
/** The hour a main meal wants to be near. Not a rule, a starting point. */
export const MEAL_HOUR = '13:00'

const DAY_BY_INDEX: DayOfWeek[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

/**
 * The weekday of a yyyy-mm-dd string, read as a local date.
 *
 * Split on the string rather than handed to `new Date(iso)`, which parses a
 * bare date as UTC midnight and therefore names the previous day everywhere
 * west of Greenwich. `dates.ts` makes the same point in the other direction.
 */
export function weekdayOf(date: string): DayOfWeek | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!match) return null
  const local = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  if (Number.isNaN(local.getTime())) return null
  return DAY_BY_INDEX[local.getDay()] ?? null
}

export interface DayInput {
  date: string
  profile: LifeProfile
  /** The planner's day for this weekday, with how long it is expected to take. */
  training?: { label: string; minutes: number; ref?: string } | null
  /** The day's plate, as `useDayPlates` already deals them out. */
  plate?: { label: string; ref?: string } | null
  /** A challenge already running, on a day it asks for. */
  challenge?: { label: string; ref?: string } | null
}

type Preference = { mode: 'largest' } | { mode: 'near'; at: number }

/**
 * Takes `minutes` out of one of the free spans, and hands back what is left.
 *
 * Two preferences, because two questions are being asked. A training session is
 * the longest thing in the day and the question is whether it fits at all, so
 * it takes the biggest hole. A meal has an hour it wants to be near and the
 * question is which free time is closest to it. Everything else is short and
 * takes the biggest hole too, which is the same as saying it is not fussy.
 */
function take(spans: readonly Span[], minutes: number, prefer: Preference): { at: Span; rest: Span[] } | null {
  const fits = spans.filter((s) => s.end - s.start >= minutes)
  if (fits.length === 0) return null

  let chosen = fits[0]
  let start = chosen.start
  if (prefer.mode === 'largest') {
    for (const span of fits) {
      /* Strictly greater, so the earliest of equally long gaps wins and the
         same profile always produces the same day. */
      if (span.end - span.start > chosen.end - chosen.start) chosen = span
    }
    start = chosen.start
  } else {
    let best = Number.POSITIVE_INFINITY
    for (const span of fits) {
      const clamped = Math.max(span.start, Math.min(prefer.at, span.end - minutes))
      const distance = Math.abs(clamped - prefer.at)
      if (distance < best) {
        best = distance
        chosen = span
        start = clamped
      }
    }
  }

  const at = { start, end: start + minutes }
  const rest: Span[] = []
  for (const span of spans) {
    if (span !== chosen) {
      rest.push(span)
      continue
    }
    if (at.start > span.start) rest.push({ start: span.start, end: at.start })
    if (at.end < span.end) rest.push({ start: at.end, end: span.end })
  }
  rest.sort((a, b) => a.start - b.start)
  return { at, rest }
}

/**
 * The day, arranged. Deterministic: same input, same output, every time.
 *
 * Deliberately memoryless. A stored day wins over a generated one everywhere it
 * is used, so this is only ever asked about a date that has no plan yet — which
 * is what makes "a slot you dropped stays dropped" true without this function
 * having to know anything about what somebody did yesterday.
 *
 * ponytail: no reconciliation against a previous plan. Editing a day keeps it;
 * rebuilding is an explicit button that throws the old one away. Add merge
 * logic only if days start needing to change under people.
 */
export function buildDay(input: DayInput, now = new Date()): DayPlan {
  const { date, profile } = input
  const day = weekdayOf(date)
  const window = wakingWindow(profile)
  const busy = day ? busySpans(profile.anchors, day, window) : []

  const slots: DaySlot[] = []
  for (const anchor of profile.anchors) {
    if (!day || !anchor.days.includes(day)) continue
    const start = minutesOf(anchor.start)
    const end = minutesOf(anchor.end)
    if (start === null || end === null || end <= start) continue
    /* Shown as entered, not as clipped. Somebody whose shift starts before they
       said they get up should see the shift they typed, and the clipping is an
       internal fact about where the free time is. */
    slots.push({
      start: anchor.start,
      end: anchor.end,
      kind: 'anchor',
      label: anchor.label,
      ref: anchor.id,
    })
  }

  let free = freeSpans(busy, window)
  const unplaced: Exclude<SlotKind, 'anchor'>[] = []

  const put = (
    kind: Exclude<SlotKind, 'anchor'>,
    minutes: number,
    label: string,
    ref: string | undefined,
    prefer: Preference,
  ) => {
    const taken = take(free, minutes, prefer)
    if (!taken) {
      unplaced.push(kind)
      return
    }
    free = taken.rest
    slots.push({ start: clockOf(taken.at.start), end: clockOf(taken.at.end), kind, label, ref })
  }

  /* Order is the priority. Training first because it is the longest thing and
     the one the rest of the app is about; the plate second because it wants a
     particular hour and taking it before the session would let half an hour of
     lunch push a ninety minute session out of the only gap that held it. */
  if (input.training && input.training.minutes > 0) {
    /* An hour they named beats the biggest hole. Still only among gaps the
       session actually fits, so a preference cannot squeeze it into forty
       minutes; it decides where among the possible, not whether. */
    const wanted = minutesOf(profile.trainAt ?? '')
    put(
      'training',
      input.training.minutes,
      input.training.label,
      input.training.ref,
      wanted === null ? { mode: 'largest' } : { mode: 'near', at: wanted },
    )
  }
  if (input.plate) {
    put('meal', MEAL_MINUTES, input.plate.label, input.plate.ref, {
      mode: 'near',
      at: minutesOf(profile.mealAt ?? '') ?? minutesOf(MEAL_HOUR)!,
    })
  }
  if (input.challenge) {
    put('challenge', CHALLENGE_MINUTES, input.challenge.label, input.challenge.ref, {
      mode: 'largest',
    })
  }

  slots.sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end))
  return { date, slots, unplaced, generatedAt: now.toISOString() }
}

/**
 * A duration in words. "45m", "1h", "2h 30m".
 *
 * Here rather than in `labels.ts` so it comes with the tests: the interesting
 * values are the ones a careless version gets wrong, and they are all near the
 * boundaries. "1h 0m" on screen is the tell that nobody checked.
 */
export function formatMinutes(minutes: number): string {
  const total = Math.max(0, Math.round(minutes))
  const h = Math.floor(total / 60)
  const m = total % 60
  if (h === 0) return `${m}m`
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

/** How much of the waking day is still free, in minutes. For one honest line. */
export function freeMinutes(plan: DayPlan, profile: LifeProfile): number {
  const window = wakingWindow(profile)
  const busy: Span[] = []
  for (const slot of plan.slots) {
    const start = minutesOf(slot.start)
    const end = minutesOf(slot.end)
    if (start === null || end === null || end <= start) continue
    const clipped = { start: Math.max(start, window.start), end: Math.min(end, window.end) }
    if (clipped.end > clipped.start) busy.push(clipped)
  }
  busy.sort((a, b) => a.start - b.start)
  const merged: Span[] = []
  for (const span of busy) {
    const last = merged[merged.length - 1]
    if (last && span.start <= last.end) last.end = Math.max(last.end, span.end)
    else merged.push({ ...span })
  }
  return freeSpans(merged, window).reduce((total, gap) => total + (gap.end - gap.start), 0)
}
