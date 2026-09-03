/**
 * Whether this webhook really came from Stripe.
 *
 * **The signature is the authentication.** No session is involved and none can
 * be: Stripe is not signed in as anybody. So this predicate is the entire
 * boundary between "a payment happened" and "somebody posted some JSON at us",
 * and it is a file of its own with tests for the same reason `coach_host.js` is.
 *
 * Stripe sends:
 *
 *   Stripe-Signature: t=1757937000,v1=5257a869…,v1=…
 *
 * and the signed payload is `${t}.${rawBody}` — the raw bytes, HMAC-SHA256, hex.
 * Two consequences that are easy to get wrong and quiet when you do:
 *
 * 1. The body must be the bytes that arrived. `e.requestInfo().body` is already
 *    parsed and re-serialising it changes whitespace and key order, so the
 *    digest would never match. `readerToString(e.request.body)` is the one
 *    source, and it has to be read before anything else touches the request.
 * 2. The timestamp has to be checked. Without it a signature stays valid
 *    forever, and a replayed body an attacker captured once is accepted a year
 *    later.
 *
 * The HMAC and the comparison are injected rather than reached for, so this can
 * be tested with `node:crypto` outside PocketBase. The handler passes
 * `$security.hs256` and `$security.equal`; the second is the constant-time one,
 * and using it rather than `===` is the difference between a comparison and a
 * comparison that leaks how much of the digest was right.
 */

/** Stripe's own tolerance, and the one every one of their libraries ships. */
const DEFAULT_TOLERANCE_SEC = 300

/**
 * `t=…,v1=…,v1=…` into its parts.
 *
 * More than one `v1` is normal and not a curiosity: during a secret rotation
 * Stripe signs with both, so accepting a header with several and matching any
 * of them is what makes rotating a secret possible without dropping events.
 */
function parseSignatureHeader(header) {
  const out = { timestamp: null, signatures: [] }
  for (const part of String(header || '').split(',')) {
    const eq = part.indexOf('=')
    if (eq <= 0) continue
    const key = part.slice(0, eq).trim()
    const value = part.slice(eq + 1).trim()
    if (key === 't') {
      const seconds = Number(value)
      if (Number.isFinite(seconds)) out.timestamp = seconds
    } else if (key === 'v1' && value !== '') {
      out.signatures.push(value)
    }
  }
  return out
}

/**
 * Verifies a webhook. Returns a reason rather than a boolean, so the route can
 * log which of these happened without a second look at the header.
 *
 * `secrets` is a list so a rotation can run: the current secret and the
 * previous one both verify until the old endpoint is retired.
 */
function verifyStripeSignature(options) {
  const header = options.header
  const body = options.body
  const secrets = (Array.isArray(options.secrets) ? options.secrets : [options.secrets]).filter(
    (s) => typeof s === 'string' && s !== '',
  )
  const nowSec = options.nowSec
  const tolerance = options.toleranceSec == null ? DEFAULT_TOLERANCE_SEC : options.toleranceSec
  const hmac = options.hmac
  const equal = options.equal || ((a, b) => a === b)

  if (secrets.length === 0) return { ok: false, reason: 'no-secret' }
  if (typeof body !== 'string' || body === '') return { ok: false, reason: 'no-body' }

  const parsed = parseSignatureHeader(header)
  if (parsed.timestamp === null) return { ok: false, reason: 'no-timestamp' }
  if (parsed.signatures.length === 0) return { ok: false, reason: 'no-signature' }

  /**
   * Both directions, and the future one matters as much.
   *
   * A stamp far in the future is not a clock that ran fast, it is a body
   * somebody built. Only checking the past would accept it.
   */
  if (Math.abs(nowSec - parsed.timestamp) > tolerance) return { ok: false, reason: 'stale' }

  const signed = `${parsed.timestamp}.${body}`
  for (const secret of secrets) {
    let digest
    try {
      digest = hmac(signed, secret)
    } catch {
      return { ok: false, reason: 'hmac-failed' }
    }
    if (typeof digest !== 'string' || digest === '') return { ok: false, reason: 'hmac-failed' }
    for (const candidate of parsed.signatures) {
      /* Length first, because a constant-time compare of different lengths is
         a comparison of different lengths however carefully it is written. */
      if (candidate.length === digest.length && equal(candidate, digest)) {
        return { ok: true, reason: 'ok', timestamp: parsed.timestamp }
      }
    }
  }
  return { ok: false, reason: 'mismatch' }
}

/**
 * Which mode this server is configured for, from the key it holds.
 *
 * Derived rather than configured, because a second environment variable saying
 * the same thing is a second thing to get wrong, and the one that would be
 * wrong is the one nobody notices: a test-mode server happily applying a live
 * event, or a live server refusing real money.
 */
function livemodeOf(secretKey) {
  const key = String(secretKey || '')
  if (key.startsWith('sk_live_') || key.startsWith('rk_live_')) return true
  if (key.startsWith('sk_test_') || key.startsWith('rk_test_')) return false
  return null
}

module.exports = {
  DEFAULT_TOLERANCE_SEC,
  parseSignatureHeader,
  verifyStripeSignature,
  livemodeOf,
}
