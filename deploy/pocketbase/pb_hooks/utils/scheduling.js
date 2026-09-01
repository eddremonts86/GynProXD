/**
 * When a message may be told to wait.
 *
 * The rule that actually hides a scheduled message is in the collection's read
 * rule, where `@now` does the work. What is left for a hook is the part a rule
 * cannot say: whether this gym bought the feature, and whether the time it
 * asked for is a time worth honouring.
 *
 * Here rather than beside the handler because each hook handler runs in its own
 * isolated VM: a function declared next to the handler is invisible inside it,
 * and calling it fails as a bare 400 with nothing in the log.
 */

/**
 * How far back a schedule may sit and still be honoured.
 *
 * Not zero. The time comes off the operator's own device, and a phone whose
 * clock is a minute behind the server would have every "publish now" rejected
 * as being in the past — a refusal nobody could act on and nobody could see the
 * cause of. Past this, the intent is genuinely stale.
 */
const PAST_TOLERANCE_MS = 5 * 60 * 1000

/**
 * How far ahead one may sit.
 *
 * A quarter is longer than any menu, offer or event anybody plans here, and it
 * bounds how long an unpublished row can sit in the collection. Beyond it, a
 * date is far more likely a typo — a year mistyped — than a plan, and the cost
 * of refusing a real one is a sentence, while the cost of accepting a typo is a
 * message that surfaces years later with nobody left who remembers writing it.
 */
const MAX_AHEAD_MS = 90 * 24 * 60 * 60 * 1000

/** PocketBase stores dates as "YYYY-MM-DD HH:MM:SS.sssZ". */
function parse(value) {
  const raw = String(value || '').trim()
  if (!raw) return null
  const ms = Date.parse(raw.replace(' ', 'T'))
  return Number.isNaN(ms) ? NaN : ms
}

/**
 * The whole decision, so a test can ask it without a server.
 *
 * Returns null when the schedule is acceptable, or the sentence to refuse it
 * with. Refused in words rather than silently published now: a gym that meant
 * Monday and got Sunday evening would rather be told.
 *
 * `sent` is whether the caller put `publish_at` in the request at all, and it
 * carries the only signal available for a date nobody can read. PocketBase
 * parses a request into typed values before any hook sees it, so an unparseable
 * date arrives already coerced to empty — identical, by then, to not asking for
 * one. Caught by the audit, which watched "next tuesday-ish" publish
 * immediately. A field that was sent and arrived empty is therefore a date that
 * did not survive the trip, and the client omits the field entirely rather than
 * sending an empty one to mean now.
 */
function refuseSchedule(publishAt, plan, isHouse, now, sent) {
  const at = parse(publishAt)
  if (at === null) {
    return sent ? 'That is not a date I can read.' : null
  }
  if (Number.isNaN(at)) return 'That is not a date I can read.'

  /* The house is the platform, not a customer, so no plan applies to it. */
  if (!isHouse && plan !== 'plus') {
    return 'Writing now and publishing later is part of Plus.'
  }
  if (at < now - PAST_TOLERANCE_MS) {
    return 'That time has already passed. Leave it empty to publish now.'
  }
  if (at > now + MAX_AHEAD_MS) {
    return 'Ninety days is as far ahead as this goes.'
  }
  return null
}

module.exports = { PAST_TOLERANCE_MS, MAX_AHEAD_MS, parse, refuseSchedule }
