import type { DayOfWeek } from './types'
import {
  busySpans,
  clockOf,
  datedSpans,
  freeSpans,
  mergeSpans,
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

export type SlotKind =
  | 'anchor'
  | 'busy'
  | 'event'
  | 'training'
  | 'meal'
  | 'challenge'
  | 'intimacy'

/**
 * The kinds this file places into free time, as opposed to the two it is told
 * about. Spelled out rather than derived with `Exclude`, because `busy` joined
 * the union and an `Exclude<SlotKind, 'anchor'>` quietly started claiming a
 * calendar block could come back unplaced.
 */
export type PlacedKind = 'training' | 'meal' | 'challenge' | 'intimacy'

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
  unplaced: PlacedKind[]
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
  /**
   * Things the member said yes to on this date: a gym event with an RSVP.
   *
   * Fixed time, like an anchor and unlike everything the placer arranges. Being
   * somewhere at seven because you said you would be is not a preference, and a
   * planner that scheduled a session over it would be wrong in the way that
   * ends the relationship.
   */
  commitments?: readonly { label: string; start: string; end: string; ref?: string }[]
  /**
   * The intimate activity module, when it is switched on for this device.
   *
   * Placed last of everything, so it can never displace a session, a meal or a
   * challenge day: it takes whatever is left. The label is the caller's and it
   * is neutral on purpose — a day plan is a thing people leave open on a
   * kitchen table.
   */
  intimacy?: { label: string; minutes: number } | null
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
  /* Two sources, merged once. Weekly anchors are what somebody described;
     dated blocks are what their calendar says about this particular day. */
  const committed: Span[] = []
  for (const item of input.commitments ?? []) {
    const from = minutesOf(item.start)
    const to = minutesOf(item.end)
    if (from === null || to === null || to <= from) continue
    const clipped = { start: Math.max(from, window.start), end: Math.min(to, window.end) }
    if (clipped.end > clipped.start) committed.push(clipped)
  }

  /* Three sources, merged once. Weekly anchors are what somebody described,
     dated blocks are what their calendar says, and commitments are what they
     told a gym they would turn up to. */
  const busy = mergeSpans([
    ...(day ? busySpans(profile.anchors, day, window) : []),
    ...datedSpans(profile.busy, date, window),
    ...committed,
  ])

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

  for (const block of profile.busy ?? []) {
    if (block.date !== date) continue
    const from = minutesOf(block.start)
    const to = minutesOf(block.end)
    /* The same guard `datedSpans` applies, and it has to be here too: without
       it a block whose end precedes its start blocked nothing and still drew a
       row on the day, which is a slot running backwards on somebody's screen. */
    if (from === null || to === null || to <= from) continue
    slots.push({
      start: block.start,
      end: block.end,
      kind: 'busy',
      /* No title kept means no title shown. "Busy" is the honest label for a
         block imported without one, and it is what the day needs to know. */
      label: block.label && block.label.trim() !== '' ? block.label : 'Busy',
      ref: block.id,
    })
  }

  for (const item of input.commitments ?? []) {
    const from = minutesOf(item.start)
    const to = minutesOf(item.end)
    if (from === null || to === null || to <= from) continue
    slots.push({
      start: item.start,
      end: item.end,
      kind: 'event',
      label: item.label,
      ref: item.ref,
    })
  }

  let free = freeSpans(busy, window)
  const unplaced: PlacedKind[] = []

  const put = (
    kind: PlacedKind,
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
  /* Last, on purpose. Everything the rest of the app is actually about has
     already taken the room it needs. */
  if (input.intimacy && input.intimacy.minutes > 0) {
    put('intimacy', input.intimacy.minutes, input.intimacy.label, undefined, { mode: 'largest' })
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

/* -------------------------------------------------------------- the screen */

/**
 * Which lane each slot draws in, so two things at once sit side by side.
 *
 * A proportional timeline puts a block where its minutes are, and "recojo
 * niños 16:30" sits inside "Trabajo 09:00 to 17:00". Drawn naively they
 * overlap and the shorter one vanishes. The standard calendar answer is lanes:
 * sweep in start order, give each block the lowest lane that is free by the
 * time it starts, and size every block in a cluster to the cluster's width.
 *
 * Pure and indexed by position in `slots`, so the caller can zip it back.
 */
export interface Lane {
  lane: number
  /** How many lanes the overlapping cluster this slot belongs to needs. */
  lanes: number
}

export function lanesFor(slots: readonly DaySlot[]): Lane[] {
  const indexed = slots
    .map((slot, index) => ({ index, start: minutesOf(slot.start), end: minutesOf(slot.end) }))
    .filter((s): s is { index: number; start: number; end: number } => s.start !== null && s.end !== null && s.end > s.start)
    .sort((a, b) => a.start - b.start || b.end - a.end)

  const out: Lane[] = slots.map(() => ({ lane: 0, lanes: 1 }))
  /* The end minute of whatever currently occupies each lane. */
  let laneEnds: number[] = []
  let cluster: number[] = []

  const closeCluster = () => {
    const width = laneEnds.length
    for (const index of cluster) out[index].lanes = Math.max(1, width)
    laneEnds = []
    cluster = []
  }

  for (const s of indexed) {
    /* Every lane that has finished before this one starts is free again. If
       none are occupied at all, the previous cluster is over. */
    if (laneEnds.length > 0 && laneEnds.every((end) => end <= s.start)) closeCluster()
    let lane = laneEnds.findIndex((end) => end <= s.start)
    if (lane === -1) {
      lane = laneEnds.length
      laneEnds.push(s.end)
    } else {
      laneEnds[lane] = s.end
    }
    out[s.index].lane = lane
    cluster.push(s.index)
  }
  closeCluster()
  return out
}

/**
 * Where the day is right now, for the one tile that says so.
 *
 * `in` is inside a block; `free` is between two; `before` and `after` are
 * outside the waking window. `until` is the minute the current state ends,
 * so the tile can count down to it. `other` is any date that is not today,
 * where "now" means nothing.
 */
export type NowKind = 'before' | 'in' | 'free' | 'after' | 'other'

export interface NowState {
  kind: NowKind
  /** The block we are in, or the next one when free. */
  label?: string
  /** Minutes since midnight when this state ends. */
  until: number | null
}

export function nowState(
  plan: DayPlan,
  profile: LifeProfile,
  nowMinutes: number,
  isToday: boolean,
): NowState {
  if (!isToday) return { kind: 'other', until: null }
  const window = wakingWindow(profile)
  if (nowMinutes < window.start) return { kind: 'before', until: window.start }
  if (nowMinutes >= window.end) return { kind: 'after', until: null }

  const spans = plan.slots
    .map((slot) => ({ slot, start: minutesOf(slot.start), end: minutesOf(slot.end) }))
    .filter((s): s is { slot: DaySlot; start: number; end: number } => s.start !== null && s.end !== null && s.end > s.start)

  const inside = spans.filter((s) => s.start <= nowMinutes && nowMinutes < s.end)
  if (inside.length > 0) {
    /* Several at once: name the one that started last (the more specific
       thing, "recojo niños" inside "Trabajo") and end when the last one does. */
    const named = inside.reduce((a, b) => (b.start > a.start ? b : a))
    const until = Math.max(...inside.map((s) => s.end))
    return { kind: 'in', label: named.slot.label, until }
  }

  const next = spans.filter((s) => s.start > nowMinutes).sort((a, b) => a.start - b.start)[0]
  return { kind: 'free', label: next?.slot.label, until: next ? next.start : window.end }
}
