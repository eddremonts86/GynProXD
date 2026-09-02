/**
 * Which plan a gym is on, and what that buys.
 *
 * `/for-gyms` sells Base and Plus. Until this existed the product had no idea
 * either did: every gym got every feature, including the kitchen the page
 * charges €100 a month more for. A page describing a product that does not
 * distinguish its plans is wrong in the expensive direction the moment somebody
 * pays the lower one.
 *
 * `BUILT` is the single fact both sides read. The landing marks a feature
 * `Coming` when it is not in here; the panel gates on the same set. So a
 * feature cannot be advertised as shipped while the gate still refuses it, and
 * turning one on is one line in one file.
 *
 * `second-rooms` is its own entry rather than half of `operators`, because the
 * two are not one feature. Staff who can publish is a roster on a gym that
 * already exists; more than one location under one account is a question about
 * what a gym *is* in the data — every message, member, join code and plan check
 * currently belongs to exactly one row. Sold as a single card, shipping the
 * roster would have quietly left half a headline unbuilt with nothing marking
 * it.
 */

export type GymPlan = 'base' | 'plus'

/** Everything Plus adds, in the order the page lists it. */
export const PLUS_FEATURES = [
  'kitchen',
  'programmes',
  'open-door',
  'scheduling',
  'reach-window',
  'operators',
  'second-rooms',
  'branding',
] as const

export type PlusFeature = (typeof PLUS_FEATURES)[number]

/**
 * What is actually built. Everything else is `Coming` on the page and absent
 * from the product, which are the same statement said twice.
 */
const BUILT = new Set<PlusFeature>([
  'kitchen',
  'programmes',
  'open-door',
  'scheduling',
  'reach-window',
  'operators',
])

/**
 * How many people may work a gym's desk.
 *
 * The server holds the same two numbers in `pb_hooks/utils/operators.js` and is
 * the one that enforces them; this copy is so the panel can say "3 of 5" and
 * name the limit before somebody runs into it. Two copies of a number is a
 * thing to keep in step, and the alternative — asking the server what the cap
 * is before drawing a list — is a round trip to learn a constant.
 */
export const SEATS_FOR: Record<GymPlan, number> = { base: 1, plus: 5 }

export function isBuilt(feature: PlusFeature): boolean {
  return BUILT.has(feature)
}

/**
 * Absent, unknown or anything unrecognised reads as `base`.
 *
 * The wrong way to be wrong is to hand somebody a paid feature because a field
 * was empty — a gym would use it, and taking it back later is worse than never
 * having offered it.
 */
export function planOf(raw: unknown): GymPlan {
  return raw === 'plus' ? 'plus' : 'base'
}

/**
 * Whether a gym on this plan gets this feature.
 *
 * A feature that is not built is refused whatever the plan, so a half-shipped
 * one cannot leak out through a Plus account before it is finished.
 */
export function planAllows(plan: GymPlan, feature: PlusFeature): boolean {
  return isBuilt(feature) && plan === 'plus'
}
