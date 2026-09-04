import {
  INTIMATE_ACTIVITIES,
  type Effort,
  type IntimateActivity,
  type Limitation,
  type Posture,
} from '../data/intimacy'

/**
 * Finding the arrangement somebody is actually asking about.
 *
 * The module started with one filter, limitations, and that answered one
 * question: what will not hurt. The rest of what a person wants is as concrete
 * and was unanswerable — "something where nobody has to kneel", "something
 * light", "something facing each other" — so the search is those axes and no
 * more. There is no external source to call: this is a written library of
 * twenty entries and every field it can be searched on is in it.
 *
 * Every axis narrows, and an empty axis means "no opinion". Within one axis the
 * values are alternatives (light *or* moderate); across axes they are
 * requirements (light *and* seated). That is the only combination people expect
 * from a row of chips, and getting it the other way round makes a filter that
 * grows the list when you tap it.
 *
 * Limitations are subtractive rather than selective and stay that way: naming
 * a bad back removes what is unkind to a back, and does not demote everything
 * that fails to mention one.
 */

export interface ActivityQuery {
  /** Free text over the name, the description and the practical note. */
  text?: string
  /** Any of these effort bands. Empty means all of them. */
  effort?: readonly Effort[]
  /** Anything that puts a body in any of these. Empty means all of them. */
  postures?: readonly Posture[]
  /** Facing each other, or not. Undefined means either. */
  facing?: boolean
  /** What the body is working around. Anything unkind to one of these goes. */
  limitations?: readonly Limitation[]
}

/**
 * Case- and accent-insensitive, because "espalda" and "Espalda" are the same
 * word and a search that disagrees is a search that looks broken.
 */
function fold(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function haystack(activity: IntimateActivity): string {
  return fold(`${activity.name} ${activity.description} ${activity.note ?? ''}`)
}

/** Whether one entry survives one query. Exported for the screen's counts. */
export function matches(activity: IntimateActivity, query: ActivityQuery): boolean {
  const words = fold(query.text ?? '')
    .split(/\s+/)
    .filter((word) => word.length > 0)
  if (words.length > 0) {
    const hay = haystack(activity)
    if (!words.every((word) => hay.includes(word))) return false
  }
  if (query.effort && query.effort.length > 0 && !query.effort.includes(activity.effort)) {
    return false
  }
  if (query.postures && query.postures.length > 0) {
    if (!activity.postures.some((posture) => query.postures!.includes(posture))) return false
  }
  if (query.facing !== undefined && activity.facing !== query.facing) return false
  if (query.limitations && query.limitations.length > 0) {
    if (activity.avoidWith.some((l) => query.limitations!.includes(l))) return false
  }
  return true
}

/**
 * The library, narrowed.
 *
 * Ordered by how well it suits what was named, then by effort, then by the
 * order they were written in. Something explicitly kind to a bad back belongs
 * above something that merely does not hurt one, and when nothing is named the
 * order is the file's own, which is roughly gentlest first.
 */
export function searchActivities(
  query: ActivityQuery = {},
  all: readonly IntimateActivity[] = INTIMATE_ACTIVITIES,
): IntimateActivity[] {
  const named = query.limitations ?? []
  const rank = (activity: IntimateActivity) =>
    named.length === 0 ? 0 : -activity.suits.filter((l) => named.includes(l)).length
  const order = new Map(all.map((activity, index) => [activity.id, index]))
  return all
    .filter((activity) => matches(activity, query))
    .sort((a, b) => rank(a) - rank(b) || order.get(a.id)! - order.get(b.id)!)
}

/** How many the query left out, so a screen can say so rather than just shrink. */
export function excludedBy(
  query: ActivityQuery = {},
  all: readonly IntimateActivity[] = INTIMATE_ACTIVITIES,
): number {
  return all.length - searchActivities(query, all).length
}

/** Whether the library has any drawings yet, for the one line above the list. */
export function anyArt(all: readonly IntimateActivity[] = INTIMATE_ACTIVITIES): boolean {
  return all.some((activity) => activity.art !== null)
}

/** Whether anything at all is being asked, for the "clear it" affordance. */
export function isEmptyQuery(query: ActivityQuery): boolean {
  return (
    (query.text ?? '').trim() === '' &&
    (query.effort ?? []).length === 0 &&
    (query.postures ?? []).length === 0 &&
    query.facing === undefined &&
    (query.limitations ?? []).length === 0
  )
}
