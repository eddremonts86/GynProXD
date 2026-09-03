/**
 * What a member pays for, and what that buys.
 *
 * `gym-plan.ts` is the same idea aimed at a business: a tier, a price, and a
 * `BUILT` set so the page cannot advertise a feature the gate refuses. This is
 * its consumer twin, and it is a second file rather than a second field on the
 * first because the two axes do not meet. A gym on Plus buys a kitchen and a
 * roster; a member on Pro buys a day. Neither implies the other, and folding
 * them into one union would put `planAllows(plan, 'day-plan')` in reach of a
 * caller holding a gym.
 *
 * One price and one interval, deliberately. Annual, coupons and trials are each
 * a second number to reason about, a second thing for the copy to state
 * correctly, and a second path through whatever eventually charges the card.
 * There is one price here until somebody decides otherwise on purpose.
 */

/** Euros a month, tax on top. Stated on screen as the price plus that line. */
export const PRO_PRICE = 15

/**
 * Everything Pro covers, in the order the product will present it.
 *
 * A name in this list is a promise the interface may make. Whether it is a
 * promise the interface may *keep* is `BUILT`, one declaration below.
 */
export const PRO_FEATURES = [
  'day-plan',
  'companion',
  'calendar',
  'culture',
  'intimacy',
] as const

export type ProFeature = (typeof PRO_FEATURES)[number]

/**
 * What is actually built. Empty, today, and that is the honest answer.
 *
 * This branch builds the entitlement and nothing that sits behind it: an
 * account can be Pro and there is not yet a single screen the status unlocks.
 * Each feature is added here by the phase that finishes it, which is why the
 * gate and the copy cannot drift apart: one set, read by both.
 *
 * The failure this prevents is specific and has happened once already in this
 * codebase, to a gym. `second-rooms` sat on the Plus card as a shipped feature
 * while nothing behind it existed, and the fix was to take the card away rather
 * than to tick it. A `BUILT` set is that lesson written down where it cannot be
 * forgotten.
 */
const BUILT = new Set<ProFeature>([])

export function isBuilt(feature: ProFeature): boolean {
  return BUILT.has(feature)
}

/**
 * Whether a member in this state gets this feature.
 *
 * A feature that is not built is refused however much somebody has paid, so a
 * half-finished screen cannot leak out through a real subscription before it is
 * ready. Same order of checks as `planAllows`, for the same reason.
 */
export function proAllows(pro: boolean, feature: ProFeature): boolean {
  return isBuilt(feature) && pro
}

/** Whether any of it is worth selling yet. Guards the pricing copy itself. */
export function anythingBuilt(): boolean {
  return PRO_FEATURES.some(isBuilt)
}
