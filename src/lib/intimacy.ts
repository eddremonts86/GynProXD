import { INTIMATE_ACTIVITIES, type IntimateActivity, type Limitation } from '../data/intimacy'
import { searchActivities } from './intimacy-search'

/**
 * The intimate activity module: who may see it, and what it shows them.
 *
 * Three gates, and each one is doing different work.
 *
 *   Pro          it is part of the subscription, like everything else here.
 *   Eighteen     affirmed once, and it is the one gate that is about the
 *                content rather than the account.
 *   On           off until somebody turns it on. Nobody encounters this by
 *                opening a menu they were using for something else.
 *
 * ## Nothing about it leaves the device
 *
 * The switch and the affirmation live in `localStorage`, deliberately outside
 * `records.ts`, so they are never in an envelope and never on the server. That
 * is not the pattern for a preference in this app — wake time and anchors all
 * sync — and the exception is the point: "this person opted into sexual
 * wellness content" is data concerning somebody's sex life under Article 9, and
 * the cheapest way to hold Article 9 data correctly is not to hold it. The
 * precedent for excluding something from the synced record already exists:
 * `activeWorkout` is left out because it belongs to the phone in your hand.
 *
 * A second device is therefore a second opt-in. That is the cost and it is
 * worth it: the alternative is a row on a server that says this about somebody,
 * even encrypted, even unreadable.
 *
 * ## What is deliberately not here
 *
 * **No log.** No dates, no durations, no mood, nothing recorded. The plan
 * described an `intimacyLog` collection and it is not built, for the same
 * reason the question bank is not: a record of somebody's sexual activity is
 * Article 9 data, and Task 0.3's DPIA is what governs holding it. The module is
 * useful without one — the useful part is being told which arrangements suit a
 * bad back — and adding a log is a decision with paperwork attached rather than
 * a field.
 *
 * **No streaks, no goals, no counts.** A frequency target on somebody's sex
 * life is a way to make them feel worse, and this product's voice is factual
 * rather than motivational. That commitment has never mattered more than here.
 *
 * **No calorie figures.** See the citation in `data/intimacy.ts`.
 */

const ON_KEY = 'forma-intimacy'
const AGE_KEY = 'forma-intimacy-18'

export interface IntimacyState {
  /** Whether the module is switched on, on this device. */
  on: boolean
  /** Whether the person at this device has said they are over eighteen. */
  affirmed: boolean
}

function read(key: string): boolean {
  try {
    return localStorage.getItem(key) === 'yes'
  } catch {
    /* Private mode, or storage refused. Off is the safe answer. */
    return false
  }
}

function write(key: string, value: boolean): void {
  try {
    if (value) localStorage.setItem(key, 'yes')
    else localStorage.removeItem(key)
  } catch {
    /* Nothing to do. The module stays off for this session, which is correct. */
  }
}

export function intimacyState(): IntimacyState {
  return { on: read(ON_KEY), affirmed: read(AGE_KEY) }
}

/** Both together, because turning it on without the affirmation is not a state. */
export function setIntimacyOn(on: boolean): void {
  write(ON_KEY, on)
  if (on) write(AGE_KEY, true)
}

/**
 * Forgets everything about it on this device, including the affirmation.
 *
 * Separate from switching it off so that "off" can mean "not right now" and
 * this can mean "as though it was never here". The nav item, the Settings
 * section and the day all read `on`, so this is what a shared phone needs.
 */
export function forgetIntimacy(): void {
  write(ON_KEY, false)
  write(AGE_KEY, false)
}

/** Whether the module should be drawn at all, given the account and the device. */
export function intimacyVisible(pro: boolean, state = intimacyState()): boolean {
  return pro && state.on && state.affirmed
}

/**
 * The activities that suit a body working around these things.
 *
 * Filtering rather than warning, because a warning on twenty cards is twenty
 * warnings nobody reads. What is filtered out is listed by count on the screen
 * so nobody wonders whether the list is broken.
 *
 * One line over `searchActivities` now that the screen searches on more than
 * this. Kept as its own name because this is the question the rest of the
 * product asks — "what will not hurt" — and because the guarantee its tests
 * hold, that no single limitation empties the library, is about the content
 * rather than about the search.
 */
export function activitiesFor(limitations: readonly Limitation[]): IntimateActivity[] {
  return searchActivities({ limitations })
}

/** How many were left out, so the screen can say so rather than just shrink. */
export function excludedCount(limitations: readonly Limitation[]): number {
  return INTIMATE_ACTIVITIES.length - activitiesFor(limitations).length
}

/**
 * How long a slot on the day is given, when the module is on.
 *
 * Thirty minutes, and it is not a claim about anybody. It is the same kind of
 * number as `MEAL_MINUTES`: a block wide enough to be worth having on a day and
 * narrow enough that it does not swallow an evening.
 */
export const INTIMACY_MINUTES = 30

/**
 * The label the day uses. Neutral on purpose.
 *
 * A day plan is a thing people leave open on a kitchen table and hand to
 * somebody to look at a recipe. Nothing on it needs to announce this, and the
 * module has its own screen for the detail.
 */
export const INTIMACY_LABEL = 'Time together'

/**
 * The one function the aggregates use to be sure they are not counting this.
 *
 * There is nothing to exclude today, because nothing is logged — and that is
 * exactly when to write this down. The moment a log exists, `stats.ts`,
 * `muscle-volume.ts`, the personal-record check and the JSON export each have
 * to ask, and a helper they can already point at is the difference between one
 * decision and four.
 */
export function isIntimacyRecord(collection: string): boolean {
  return collection === 'intimacyLog'
}
