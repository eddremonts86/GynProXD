/**
 * The signed state that survives a round trip through somebody else's consent
 * screen, shared by every provider that has one.
 *
 * `<userId>.<expiry>.<mac>`, signed with the server's own secret. It carries
 * who started the flow, so the callback does not have to trust a session that
 * may not exist on the redirect, and it expires, so a captured link is not a
 * standing invitation to attach a calendar to somebody's account.
 *
 * Its own module rather than a copy per provider. It was written inside
 * `google_calendar.js` when Google was the only OAuth provider; Microsoft is
 * the second, and duplicating the one security-relevant function in the
 * calendar code would be the wrong way to add it. Nothing here requires
 * anything else, which is what lets `oauth-state.spec.ts` evaluate the shipped
 * file directly.
 */

/** How long a signed state is good for: one trip through a consent screen. */
const STATE_TTL_MS = 10 * 60 * 1000

function base64url(value) {
  return String(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function signState(userId, expiresAtMs, secret) {
  const body = String(userId) + '.' + String(expiresAtMs)
  return body + '.' + base64url($security.hs256(body, secret))
}

/** The account id the state names, or null when it does not check out. */
function verifyState(state, secret, nowMs) {
  const parts = String(state || '').split('.')
  if (parts.length !== 3) return null
  const body = parts[0] + '.' + parts[1]
  const expected = base64url($security.hs256(body, secret))
  /* Constant time, because this is the whole identity check on a route that
     arrives with no session. */
  if (!$security.equal(expected, parts[2])) return null
  const expiresAt = Number(parts[1])
  if (!Number.isFinite(expiresAt) || expiresAt < nowMs) return null
  return parts[0]
}

module.exports = { STATE_TTL_MS, base64url, signState, verifyState }
