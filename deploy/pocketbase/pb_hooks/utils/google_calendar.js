/**
 * Google Calendar, reduced to the parts worth testing.
 *
 * Everything here is pure: URLs, the signed state, the window, and the
 * translation from Google's event shape to the busy blocks this app already
 * understands. `calendar.pb.js` does the talking. The split is the same one
 * `coach_host.js` and `events.js` use, and for the same reason — a rule that
 * decides what a member's calendar means should not be a closure inside a
 * handler where nothing can reach it.
 *
 * The scope is `calendar.events.readonly` and nothing else. Read-only is what
 * keeps Google's verification tractable, and this product has no reason to
 * write into somebody's calendar: the day already exports as a file they open
 * themselves.
 */

const SCOPE = 'https://www.googleapis.com/auth/calendar.events.readonly'
/** Three weeks, the same window the file import reads. */
const DAYS_AHEAD = 21
/** How many events one pull may carry. A bound, not a rule. */
const MAX_EVENTS = 250

/* The signed state moved to `utils/oauth_state.js` when Microsoft became the
   second OAuth provider: it is the same mechanism for both and it is the one
   security-relevant function here, so it is shared rather than copied. */

function authorizeUrl(base, clientId, redirectUri, state) {
  const params = [
    'client_id=' + encodeURIComponent(clientId),
    'redirect_uri=' + encodeURIComponent(redirectUri),
    'response_type=code',
    'scope=' + encodeURIComponent(SCOPE),
    /* Offline plus consent: without both, a second connection returns no
       refresh token and the link silently becomes read-once. */
    'access_type=offline',
    'prompt=consent',
    'include_granted_scopes=true',
    'state=' + encodeURIComponent(state),
  ]
  return String(base).replace(/\/+$/, '') + '/o/oauth2/v2/auth?' + params.join('&')
}

function form(fields) {
  const parts = []
  for (const key in fields) {
    parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(fields[key]))
  }
  return parts.join('&')
}

function codeExchangeBody(code, clientId, clientSecret, redirectUri) {
  return form({
    code: code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  })
}

function refreshBody(refreshToken, clientId, clientSecret) {
  return form({
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'refresh_token',
  })
}

/** RFC3339 with a Z, which is what `timeMin`/`timeMax` want. */
function stamp(ms) {
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z')
}

function eventsUrl(base, nowMs) {
  const params = [
    'timeMin=' + encodeURIComponent(stamp(nowMs)),
    'timeMax=' + encodeURIComponent(stamp(nowMs + DAYS_AHEAD * 24 * 60 * 60 * 1000)),
    /* Expanded by Google, so a weekly meeting arrives as its occurrences and
       nothing here has to walk an RRULE. */
    'singleEvents=true',
    'orderBy=startTime',
    'maxResults=' + MAX_EVENTS,
    'showDeleted=false',
  ]
  return String(base).replace(/\/+$/, '') + '/calendar/v3/calendars/primary/events?' + params.join('&')
}

function two(n) {
  return String(n).padStart(2, '0')
}

/**
 * One Google event to one busy block, or null.
 *
 * The exclusions are the ones `lib/ics.ts` argues for at length and they are
 * repeated here rather than assumed, because this is a second door into the
 * same day:
 *
 *   all-day events      arrive as `start.date` with no time. Google marks them
 *                       free by default and a birthday is not a reason to
 *                       refuse to train.
 *   transparency free   the calendar itself says this does not block time.
 *   cancelled           it is not happening.
 *   declined            somebody said no. Their own `responseStatus` in the
 *                       attendee list is the only opinion that counts.
 *
 * Times arrive as RFC3339 with an offset. They are converted to the wall clock
 * of the zone the event names, which for somebody's own calendar in the zone
 * they are standing in is exactly right, and is the same compromise the file
 * reader makes. An event that crosses midnight is clipped to the day it starts
 * on: the planner works one day at a time.
 */
function blockFrom(event) {
  if (!event || event.status === 'cancelled') return null
  if (event.transparency === 'transparent') return null
  const attendees = Array.isArray(event.attendees) ? event.attendees : []
  for (const person of attendees) {
    if (person && person.self === true && person.responseStatus === 'declined') return null
  }
  const start = event.start || {}
  const end = event.end || {}
  if (typeof start.dateTime !== 'string' || typeof end.dateTime !== 'string') return null
  const from = new Date(start.dateTime)
  const to = new Date(end.dateTime)
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime())) return null
  if (to.getTime() <= from.getTime()) return null

  /* Read in the event's own offset rather than the server's, which is UTC in a
     container and would move every hour by however far the member lives from
     Greenwich. */
  const offset = String(start.dateTime).match(/([+-]\d\d:\d\d)$/)
  const shift = offset
    ? (Number(offset[1].slice(1, 3)) * 60 + Number(offset[1].slice(4, 6))) *
      (offset[1][0] === '-' ? -1 : 1)
    : 0
  const local = (d) => new Date(d.getTime() + shift * 60 * 1000)
  const f = local(from)
  const t = local(to)

  const date = f.getUTCFullYear() + '-' + two(f.getUTCMonth() + 1) + '-' + two(f.getUTCDate())
  const startClock = two(f.getUTCHours()) + ':' + two(f.getUTCMinutes())
  const sameDay =
    t.getUTCFullYear() === f.getUTCFullYear() &&
    t.getUTCMonth() === f.getUTCMonth() &&
    t.getUTCDate() === f.getUTCDate()
  const endClock = sameDay ? two(t.getUTCHours()) + ':' + two(t.getUTCMinutes()) : '23:59'
  if (endClock <= startClock) return null

  return {
    date: date,
    start: startClock,
    end: endClock,
    title: typeof event.summary === 'string' ? event.summary.replace(/\s+/g, ' ').trim().slice(0, 80) : '',
  }
}

/** The whole answer, reduced and bounded. */
function busyFrom(json) {
  const items = json && Array.isArray(json.items) ? json.items : []
  const out = []
  for (const event of items) {
    const block = blockFrom(event)
    if (block) out.push(block)
    if (out.length >= MAX_EVENTS) break
  }
  out.sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start))
  return out
}

/**
 * Everything the flow needs from the environment, or null when it is not set up.
 *
 * Here rather than at the top of `calendar.pb.js` because PocketBase runs every
 * handler in its own VM: a function defined beside the routes is invisible
 * inside them, and the failure is a bare 400 with nothing in the log. Anything
 * shared by two handlers has to live in a module they each `require`.
 */
function envConfig() {
  const clientId = $os.getenv('GOOGLE_CLIENT_ID')
  const clientSecret = $os.getenv('GOOGLE_CLIENT_SECRET')
  const secret = $os.getenv('CALENDAR_SECRET')
  const redirect = $os.getenv('GOOGLE_REDIRECT_URI')
  if (!clientId || !clientSecret || !secret || !redirect) return null
  /* AES needs 32 bytes. Refusing here beats a save that throws with the token
     already in hand. */
  if (String(secret).length !== 32) return null
  return {
    clientId: clientId,
    clientSecret: clientSecret,
    secret: String(secret),
    redirect: redirect,
    authBase: $os.getenv('GOOGLE_AUTH_BASE_URL') || 'https://accounts.google.com',
    tokenBase: $os.getenv('GOOGLE_TOKEN_BASE_URL') || 'https://oauth2.googleapis.com',
    apiBase: $os.getenv('GOOGLE_API_BASE_URL') || 'https://www.googleapis.com',
    appBase: String($os.getenv('APP_BASE_URL') || '').replace(/\/+$/, ''),
    /**
     * Where Google should push to, or empty.
     *
     * Its own variable rather than something derived from `appBase`, because
     * Google will not push anywhere it has not been told about: the domain has
     * to be verified in the Cloud project and the address registered with it.
     * A server that has not done that leaves this unset, and the whole watch
     * mechanism is then absent rather than failing — the member still has
     * "Read it again", which is what they had before any of this existed.
     */
    watchAddress: String($os.getenv('GOOGLE_WATCH_ADDRESS') || '').trim(),
  }
}

/** This account's Google row, or null. */
function linkFor(app, userId) {
  try {
    return app.findFirstRecordByFilter('calendar_links', 'owner = {:o} && provider = {:p}', {
      o: userId,
      p: 'google',
    })
  } catch {
    return null
  }
}

/* ── Push: the channel, and when it has to be replaced ─────────────────────── */

/**
 * How long a channel is asked to live.
 *
 * Google decides the real number and answers with it, so this is a request and
 * `channelExpiry` is the truth. A week rather than the maximum, because a
 * channel that outlives the grant behind it is a channel that pushes
 * notifications nothing can act on.
 */
const WATCH_TTL_S = 7 * 24 * 60 * 60

/**
 * How close to expiry a channel gets replaced.
 *
 * A day, which is more than the renewal cron needs and enough that a server
 * asleep or redeploying through the window still catches it. Renewing early
 * costs one request; renewing late is a calendar that has quietly stopped
 * telling anybody anything.
 */
const RENEW_MARGIN_MS = 24 * 60 * 60 * 1000

function watchUrl(base) {
  return String(base).replace(/\/+$/, '') + '/calendar/v3/calendars/primary/events/watch'
}

/**
 * The channel Google is being asked to open.
 *
 * `token` comes back to us in `X-Goog-Channel-Token` on every notification and
 * is the whole identity of the push: it is a signed state, the same mechanism
 * the consent screen round trip uses, carrying the account and expiring with
 * the channel. Google treats it as an opaque string.
 */
function watchBody(channelId, address, token, ttlSeconds) {
  return JSON.stringify({
    id: String(channelId),
    type: 'web_hook',
    address: String(address),
    token: String(token),
    params: { ttl: String(ttlSeconds || WATCH_TTL_S) },
  })
}

function stopUrl(base) {
  return String(base).replace(/\/+$/, '') + '/calendar/v3/channels/stop'
}

/**
 * Closing a channel takes both ids.
 *
 * `resourceId` is Google's and arrives in the watch answer; the id we chose is
 * not enough on its own, which is why it is a column rather than something
 * recomputed.
 */
function stopBody(channelId, resourceId) {
  return JSON.stringify({ id: String(channelId), resourceId: String(resourceId) })
}

/**
 * When Google says the channel dies, in ms.
 *
 * `expiration` arrives as a string of milliseconds since the epoch. An answer
 * without one is not a reason to refuse the channel — it is a reason to assume
 * the TTL that was asked for and let the renewal cron correct it.
 */
function channelExpiry(json, nowMs, ttlSeconds) {
  const raw = json && json.expiration
  const parsed = Number(raw)
  if (Number.isFinite(parsed) && parsed > nowMs) return parsed
  return nowMs + (ttlSeconds || WATCH_TTL_S) * 1000
}

/**
 * Whether a channel needs opening or replacing.
 *
 * No channel at all counts: a link connected while the address was unset, or
 * one whose watch failed at connect time, is picked up by the same cron rather
 * than needing its own repair path. So does an expiry that cannot be read —
 * replacing a channel costs one request and being wrong the other way is a
 * calendar that has quietly stopped telling anybody anything.
 *
 * Plain values rather than a record, so this can be tested without one.
 * PocketBase renders a date field as `2026-09-04 11:22:33.000Z`, which is not
 * what `Date` parses, hence the reshaping.
 */
function renewDue(channel, expiresAt, nowMs) {
  if (!String(channel || '')) return true
  const raw = String(expiresAt || '')
  if (!raw) return true
  const at = new Date(raw.replace(' ', 'T').replace(/Z?$/, 'Z')).getTime()
  if (!Number.isFinite(at)) return true
  return at - nowMs <= RENEW_MARGIN_MS
}

module.exports = {
  envConfig,
  linkFor,
  SCOPE,
  DAYS_AHEAD,
  MAX_EVENTS,
  authorizeUrl,
  codeExchangeBody,
  refreshBody,
  eventsUrl,
  blockFrom,
  busyFrom,
  WATCH_TTL_S,
  RENEW_MARGIN_MS,
  watchUrl,
  watchBody,
  stopUrl,
  stopBody,
  channelExpiry,
  renewDue,
}
