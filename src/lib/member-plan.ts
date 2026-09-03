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
  /**
   * Local culture, and the reason it is still a name.
   *
   * A gym on the platform publishes events, and the day planner reads the ones
   * a member has said yes to — but that is the gym they already train at
   * telling them about its own class, which is an improvement to `day-plan`
   * rather than a feature somebody would pay separately for.
   *
   * What this word promises is what is on in somebody's town, and there is no
   * source for that. A venue's own calendar cannot be fetched from a browser
   * (no CORS headers on anybody's `.ics`) and fetching it server-side is a
   * route that will retrieve an arbitrary URL on our behalf, which is a
   * security boundary rather than a convenience. A curated per-area list is the
   * remaining option and it is a content business with a person in it.
   *
   * So the card stays untickable until there is a source. `second-rooms` is the
   * precedent: it left the Plus list rather than being marked built.
   */
  'culture',
  'intimacy',
] as const

export type ProFeature = (typeof PRO_FEATURES)[number]

/**
 * What is actually built. Four entries.
 *
 * `day-plan` is `/day`: the anchors somebody enters, and the session, plate and
 * challenge day arranged around them. `companion` is `/day/intake`: a paragraph
 * about somebody's week read into proposed anchors, by regexes always and by a
 * model when the server has one, with nothing saved until it is tapped.
 * `calendar` is the `.ics` half of `/day`: a file the member picks, read three
 * weeks ahead into dated busy blocks, and the day exported back out.
 *
 * `intimacy` is `/intimacy` plus half an hour on the day: arrangements
 * described plainly, filtered by what a body is working around, with no log, no
 * streak and no calorie figure. It is off until somebody turns it on in
 * Settings, and that switch never leaves the device.
 *
 * `culture` is still a name, and its entry above says at length why reading the
 * gym bus into the day did not earn it.
 *
 * Each feature joins this set in the phase that finishes it, which is why the
 * gate and the copy cannot drift apart: one set, read by both. The failure it
 * prevents is specific and has happened once already in this codebase, to a
 * gym. `second-rooms` sat on the Plus card as a shipped feature while nothing
 * behind it existed, and the fix was to take the card away rather than to tick
 * it. A `BUILT` set is that lesson written down where it cannot be forgotten.
 */
const BUILT = new Set<ProFeature>(['day-plan', 'companion', 'calendar', 'intimacy'])

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
