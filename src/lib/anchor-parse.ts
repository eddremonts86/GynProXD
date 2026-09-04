import { clockOf, minutesOf, type Anchor, type AnchorKind } from './life-profile'
import type { DayOfWeek } from './types'

/**
 * A sentence about somebody's week, read into the hours it names.
 *
 * "I work 9 to 5 and pick the kids up at half four" is four taps in the anchor
 * form and one sentence here, and that difference is the whole companion. What
 * it deliberately does not do is understand the sentence: it fills a form
 * instantly, offline, with no model behind it, exactly as
 * `onboarding-parse.ts` does for the programme intake, and for the same reason.
 * Idiom, sequence and typos are the coach's job.
 *
 * Nothing here is saved. Every anchor comes back as a proposal with its
 * provenance attached, and a person taps each one before it becomes a fact.
 * That is not politeness: half of what this file produces is an inference, and
 * the two cases below are the ones worth being nervous about.
 *
 *   "9 to 5"          nobody means five in the morning, so the end gains
 *                     twelve hours. Marked inferred.
 *   "at half four"    a single time is not a span, so it becomes half an hour.
 *                     Marked inferred.
 *
 * Both are almost always right and neither is knowable, which is what a review
 * step is for.
 */

/** Same vocabulary as `onboarding-parse.ts`: how a value came to be. */
export type Provenance = 'quoted' | 'inferred'

export interface ProposedAnchor extends Omit<Anchor, 'id'> {
  /**
   * The clause this came out of, so the review step can show where it came
   * from.
   *
   * Named `clause` and not `source` because `Anchor.source` already means
   * something else and narrower: which system an anchor came from, `'ics'` for
   * one imported from a calendar. Two fields with one name on types that
   * extend each other is a rename waiting to go wrong, and TypeScript said so.
   */
  clause: string
  start_from: Provenance
  end_from: Provenance
  days_from: Provenance
}

const WEEKDAYS: DayOfWeek[] = ['mon', 'tue', 'wed', 'thu', 'fri']
const WEEKEND: DayOfWeek[] = ['sat', 'sun']
const ALL_DAYS: DayOfWeek[] = [...WEEKDAYS, ...WEEKEND]

const DAY_WORDS: Array<[RegExp, DayOfWeek]> = [
  [/\b(?:mon(?:day)?s?|lunes)\b/i, 'mon'],
  [/\b(?:tue(?:s|sday)?s?|martes)\b/i, 'tue'],
  [/\b(?:wed(?:nesday)?s?|mi[eé]rcoles)\b/i, 'wed'],
  [/\b(?:thu(?:rs|rsday)?s?|jueves)\b/i, 'thu'],
  [/\b(?:fri(?:day)?s?|viernes)\b/i, 'fri'],
  [/\b(?:sat(?:urday)?s?|s[aá]bados?)\b/i, 'sat'],
  [/\b(?:sun(?:day)?s?|domingos?)\b/i, 'sun'],
]

const KIND_WORDS: Array<[RegExp, AnchorKind]> = [
  [/\b(?:work|working|office|shift|job|trabajo|trabajar|oficina|turno)\b/i, 'work'],
  [/\b(?:kids?|children|school|nursery|pick(?:\s|-)?up|drop(?:\s|-)?off|ni[nñ]os?|colegio|escuela|guarder[ií]a|recoger|llevar)\b/i, 'care'],
  [/\b(?:commut(?:e|ing)|travel|train|bus|drive|driving|coche|tren|viaje|desplazamiento)\b/i, 'travel'],
]

/** "weekdays", "de lunes a viernes", "every day", "weekends". */
const DAY_PHRASES: Array<[RegExp, DayOfWeek[]]> = [
  [/\b(?:weekdays?|week ?days|de lunes a viernes|entre semana|d[ií]as? laborables?)\b/i, WEEKDAYS],
  [/\b(?:weekends?|week ?ends|fines? de semana)\b/i, WEEKEND],
  [/\b(?:every ?day|daily|todos los d[ií]as|a diario)\b/i, ALL_DAYS],
]

/**
 * A clause is a thought. Split on the punctuation and conjunctions people
 * actually use, so "I work 9 to 5 and the school run is at 8:30" is two.
 *
 * `and`/`y` are included, which costs the odd bad split ("half four and a
 * quarter") and buys the common case of two facts in one breath. A bad split
 * produces a clause with no times in it, which is dropped rather than guessed at.
 */
function clauses(text: string): string[] {
  return String(text ?? '')
    .split(/[\n;.,]|\band\b|\by\b|\btambi[eé]n\b|\bthen\b/i)
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
}

interface Clock {
  minutes: number
  /** Whether the text named a 12-hour meridiem, which settles the ambiguity. */
  explicit: boolean
  text: string
}

/**
 * Every time in a clause, in the order they appear.
 *
 * `half four` and `cuatro y media` are deliberately absent. They are common in
 * speech and ambiguous in writing (half four is 16:30 in London and 15:30 in
 * Berlin), and a parser that gets one of those wrong writes the wrong hour into
 * somebody's week with a `quoted` provenance on it. A digit is unambiguous.
 */
function times(clause: string): { found: Clock[]; rejected: boolean } {
  const found: Clock[] = []
  /**
   * Whether the clause held something shaped like a time that is not one.
   *
   * `09:70` is not an hour and it is not a typo anybody can correct on somebody
   * else's behalf. A clause carrying one is dropped whole rather than parsed
   * around: reading the *other* time in "work 09:70 to 17:00" produces a half
   * hour block at five in the afternoon labelled "work 09 70", which is a
   * confident wrong answer where nothing was the right one.
   */
  let rejected = false
  const pattern = /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.|h)?\b/gi
  let match: RegExpExecArray | null
  while ((match = pattern.exec(clause)) !== null) {
    let hour = Number(match[1])
    const minute = match[2] === undefined ? 0 : Number(match[2])
    const meridiem = (match[3] ?? '').toLowerCase()
    if (minute > 59 || (match[2] !== undefined && hour > 24)) {
      rejected = true
      continue
    }
    if (hour > 24) continue
    /* A bare number with no colon and no meridiem in a clause with no other
       time is more likely a count than a clock ("3 times a week"). Requiring a
       colon, a meridiem or a second number is what keeps those out; the caller
       decides, since it can see how many were found. */
    const explicit = meridiem === 'am' || meridiem === 'pm' || meridiem.startsWith('a.') || meridiem.startsWith('p.')
    if (explicit) {
      if (hour === 12) hour = meridiem.startsWith('a') ? 0 : 12
      else if (meridiem.startsWith('p')) hour += 12
    }
    if (hour > 24) {
      rejected = true
      continue
    }
    const minutes = hour === 24 ? 24 * 60 : hour * 60 + minute
    found.push({ minutes, explicit: explicit || match[2] !== undefined, text: match[0].trim() })
  }
  return { found, rejected }
}

function daysOf(clause: string): { days: DayOfWeek[]; from: Provenance } {
  for (const [pattern, days] of DAY_PHRASES) {
    if (pattern.test(clause)) return { days: [...days], from: 'quoted' }
  }
  const named = DAY_WORDS.filter(([pattern]) => pattern.test(clause)).map(([, day]) => day)
  if (named.length > 0) return { days: ALL_DAYS.filter((d) => named.includes(d)), from: 'quoted' }
  /* Nothing said. Weekdays is the guess, and it is marked as one: the review
     step shows it, and a Saturday shift corrected in one tap is a better
     outcome than refusing to propose anything. */
  return { days: [...WEEKDAYS], from: 'inferred' }
}

function kindOf(clause: string): AnchorKind {
  for (const [pattern, kind] of KIND_WORDS) {
    if (pattern.test(clause)) return kind
  }
  return 'fixed'
}

/** The clause with its times, days and filler words taken out. */
function labelOf(clause: string, used: readonly Clock[]): string {
  let label = clause
  for (const clock of used) label = label.replace(clock.text, ' ')
  for (const [pattern] of [...DAY_PHRASES, ...DAY_WORDS]) label = label.replace(pattern, ' ')
  /**
   * Filler, including the verbs a sentence uses to get to the time.
   *
   * The copulas and the "get"/"go" family are here because the first version
   * shipped labels reading "school run is" and "get train home", which are
   * understandable and sloppy, and the label is what the day draws every
   * morning. Nothing that could be the name of the thing is removed: `train`
   * survives, `get` does not.
   */
  label = label
    .replace(
      /\b(?:from|to|until|till|at|on|i|my|the|de|a|las?|los?|hasta|desde|el|en|mi|is|are|am|was|were|be|been|get|gets|got|go|goes|do|does|es|son|est[aá]|estoy|tengo|voy|hay)\b/gi,
      ' ',
    )
    .replace(/[-–—:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return label.slice(0, 40)
}

/** Half an hour, for a clause that named one time and no span. */
export const SINGLE_TIME_MINUTES = 30

/**
 * Proposals, never facts. The caller shows them and a person accepts each one.
 *
 * A clause with no usable time is dropped rather than guessed at, and so is one
 * whose span cannot be made to run forwards. Producing nothing is a fine answer
 * here: the anchor form is two fields away.
 */
export function parseAnchors(text: string): ProposedAnchor[] {
  const proposals: ProposedAnchor[] = []
  for (const clause of clauses(text)) {
    const { found, rejected } = times(clause)
    if (rejected) continue
    /* One bare number with no colon and no meridiem is a count, not a clock. */
    const usable = found.length === 1 && !found[0].explicit ? [] : found
    if (usable.length === 0) continue

    const [first, second] = usable
    let start = first.minutes
    let end = second === undefined ? start + SINGLE_TIME_MINUTES : second.minutes
    let endFrom: Provenance = second === undefined ? 'inferred' : 'quoted'

    /* "9 to 5". Nobody means five in the morning. Only when neither end named a
       meridiem, so "11pm to 6am" is still refused rather than turned into a
       twelve hour day nobody described. */
    if (second !== undefined && end <= start && !first.explicit && !second.explicit && end + 12 * 60 > start) {
      end += 12 * 60
      endFrom = 'inferred'
    }
    if (end <= start || end > 24 * 60) continue

    const { days, from } = daysOf(clause)
    const label = labelOf(clause, usable)
    proposals.push({
      label: label === '' ? 'Busy' : label,
      days,
      start: clockOf(start),
      end: clockOf(end),
      kind: kindOf(clause),
      clause,
      start_from: 'quoted',
      end_from: endFrom,
      days_from: from,
    })
  }
  return proposals
}

/**
 * A proposal from anywhere, checked into a shape the store will accept.
 *
 * The coach's answers come through here too, which is the point: it is the same
 * check whether a sentence was read by a regex or by a model, so a hallucinated
 * hour cannot reach the profile by a route the regex path does not have. Same
 * arrangement as `validateBlocks` in `ai-plan.ts`.
 */
export function validateProposal(raw: unknown): ProposedAnchor | null {
  const value = raw as Partial<ProposedAnchor>
  if (!value || typeof value !== 'object') return null
  const start = minutesOf(String(value.start ?? ''))
  const end = minutesOf(String(value.end ?? ''))
  if (start === null || end === null || end <= start) return null
  const label = String(value.label ?? '').replace(/\s+/g, ' ').trim().slice(0, 40)
  if (label === '') return null
  const days = Array.isArray(value.days) ? ALL_DAYS.filter((d) => value.days!.includes(d)) : []
  if (days.length === 0) return null
  const kind: AnchorKind = (['work', 'care', 'travel', 'fixed', 'busy'] as AnchorKind[]).includes(
    value.kind as AnchorKind,
  )
    ? (value.kind as AnchorKind)
    : 'fixed'
  return {
    label,
    days,
    start: clockOf(start),
    end: clockOf(end),
    kind,
    clause: String(value.clause ?? '').slice(0, 200),
    start_from: value.start_from === 'inferred' ? 'inferred' : 'quoted',
    end_from: value.end_from === 'inferred' ? 'inferred' : 'quoted',
    days_from: value.days_from === 'inferred' ? 'inferred' : 'quoted',
  }
}

/** Whether this proposal already exists on the profile, so it is not offered twice. */
export function alreadyThere(proposal: ProposedAnchor, anchors: readonly Anchor[]): boolean {
  return anchors.some(
    (a) =>
      a.start === proposal.start &&
      a.end === proposal.end &&
      a.label.toLowerCase() === proposal.label.toLowerCase(),
  )
}
