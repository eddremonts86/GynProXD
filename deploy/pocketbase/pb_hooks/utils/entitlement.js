/**
 * Whether an account has paid, from the one field that says so.
 *
 * A file of its own, like `coach_host.js`, and for a related reason: this
 * decides whether somebody is handed something they may not have paid for, and
 * that should not be the one predicate in the repository nothing checks. It is
 * pure so it can be — no app, no record, no clock of its own.
 *
 * The awkward part is not the comparison, it is the value. `pro_until` reads
 * back as a string over the API and as a `types.DateTime` inside the JSVM, PB
 * writes it space-separated rather than with the `T` that `Date.parse` is
 * specified for, and an empty date field is empty in two different ways
 * depending on which of those two you are holding. Every one of those turns
 * into `false` here rather than into a surprise at the call site, and `false`
 * is the safe direction: an account wrongly refused asks once and is fixed, an
 * account wrongly admitted was never charged.
 */

/**
 * The field as text, whatever shape it arrived in.
 *
 * `String(dateTime)` on the JSVM's own type yields `[object Object]`, which
 * parses to NaN and would have read as "not paid" for every paying account on
 * the server while passing every test written against the API's strings. Hence
 * `.string()` first, and hence this being a named step rather than an inline
 * coercion.
 */
function dateText(value) {
  if (value == null) return ''
  if (typeof value.string === 'function') {
    try {
      return String(value.string() || '').trim()
    } catch {
      return ''
    }
  }
  const text = String(value).trim()
  return text === '[object Object]' ? '' : text
}

/**
 * Milliseconds, or NaN.
 *
 * PocketBase stores UTC and writes `2026-10-03 00:00:00.000Z`. The space is
 * outside the ECMAScript date grammar and only works because engines accept it,
 * so it is replaced rather than relied on. A value with no zone marker at all
 * is read as UTC, which is what PB meant by it; guessing local time instead
 * would move the boundary by up to a day in whichever direction the server
 * happens to be configured.
 */
function parseInstant(text) {
  if (text === '') return NaN
  let normalised = text.replace(' ', 'T')
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(normalised)
  if (!hasZone) normalised += 'Z'
  return Date.parse(normalised)
}

/**
 * Whether this `pro_until` is still in the future at `nowMs`.
 *
 * Strictly greater than: a subscription whose last second has passed is over.
 * The alternative rounds a lapse up to a day of free access, which is not a
 * disaster and is also not what the field says.
 */
function isProAt(rawUntil, nowMs) {
  const at = parseInstant(dateText(rawUntil))
  return Number.isFinite(at) && at > nowMs
}

/**
 * The same question asked of an account id, for the handlers.
 *
 * Wrapped whole: a missing account, a renamed field or a collection that is not
 * there yet must read as "not paid" rather than throwing out of whatever route
 * asked. Nothing here is a reason to fail a request that has other work to do.
 */
function isPro(app, userId, nowMs) {
  if (!userId) return false
  try {
    const user = app.findRecordById('users', userId)
    return isProAt(user.get('pro_until'), nowMs == null ? Date.now() : nowMs)
  } catch {
    return false
  }
}

/**
 * Whether this account administers the platform.
 *
 * An admin gets every paid surface, and that is a product rule rather than a
 * courtesy: the person who runs this thing has to be able to open every screen
 * in it, or they are debugging a product they cannot see. It is answered here,
 * on the server, next to the other half of the same question — a client-side
 * exception would be one more place for the two answers to disagree.
 *
 * `platform_admins` is the same collection the app already reads to hand an
 * account the admin role on every device it signs into.
 */
function isPlatformAdmin(app, userId) {
  if (!userId) return false
  try {
    app.findFirstRecordByFilter('platform_admins', 'owner = {:o}', { o: userId })
    return true
  } catch {
    return false
  }
}

module.exports = { dateText, parseInstant, isProAt, isPro, isPlatformAdmin }
