/**
 * The open door: a gym reaching people who belong to no gym.
 *
 * Every other message in this system travels inside a relationship somebody
 * already chose. This one does not, which makes it the only place where a
 * paying customer can put something in front of a person who never asked to
 * hear from them. So the limits are here, on the server, where a client cannot
 * decline to apply them — and they are limits on the *gym*, because the gym is
 * the party with the incentive.
 *
 * Here rather than beside the handler because each hook handler runs in its own
 * isolated VM: a function declared next to the handler is invisible inside it,
 * and calling it fails as a bare 400 with nothing in the log.
 *
 * What is deliberately NOT here: any way for a gym to choose who receives one.
 * The audience is a scope, never a list. A gym never learns that a particular
 * person has no gym, which is the fact it would most like to have and the one
 * we are least entitled to hand over.
 */

/** The scope a gym uses to reach beyond its own roster. */
const OPEN_DOOR = 'open-door'

/**
 * One a month, per gym.
 *
 * Not a number pulled out of the air: the audience is shared, so this cap is
 * really about how often somebody with no gym is spoken to by strangers. Set
 * against a plausible dozen gyms, one each per month is a handful of messages;
 * anything looser and the inbox of the people who were getting nothing at all
 * becomes the reason they stop opening it.
 */
const PER_GYM_PER_MONTH = 1

/** First instant of the month a date falls in, as PocketBase stores it. */
function monthStart(now) {
  const d = new Date(now)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01 00:00:00.000Z`
}

/**
 * Whether this gym has already used its month.
 *
 * Counted from the rows themselves rather than a tally on the gym: a counter
 * is a second copy of a fact, and the day it disagrees with the rows it is the
 * counter that gets believed.
 */
function openDoorsThisMonth(app, gymId, now) {
  try {
    const rows = app.findRecordsByFilter(
      'gym_messages',
      'gym = {:g} && scope = {:s} && created >= {:from}',
      '-created',
      100,
      0,
      { g: gymId, s: OPEN_DOOR, from: monthStart(now) },
    )
    return rows.length
  } catch {
    /* A query that will not run must not become permission to publish. */
    return PER_GYM_PER_MONTH
  }
}

/**
 * The whole decision, in one place so the test can ask it directly.
 *
 * Returns null when the publish is allowed, or the sentence to refuse it with.
 * Refusing in words rather than narrowing silently: a gym that tried to reach
 * beyond its plan has misunderstood what it bought, and quietly delivering to
 * nobody would leave them believing it worked.
 */
function refuseOpenDoor(app, gym, now) {
  if (String(gym.get('plan') || '') !== 'plus') {
    return 'Reaching people with no gym is part of Plus.'
  }
  if (openDoorsThisMonth(app, gym.id, now) >= PER_GYM_PER_MONTH) {
    return 'One open-door message a month, and this month is spent.'
  }
  return null
}

module.exports = { OPEN_DOOR, PER_GYM_PER_MONTH, monthStart, openDoorsThisMonth, refuseOpenDoor }
