/**
 * Microsoft Graph, the third calendar and the closest to the second.
 *
 * The same shape as Google: an OAuth code flow, a refresh token sealed on the
 * same table, and one read per pull. `Calendars.Read` and `offline_access` and
 * nothing else, which is not a sensitive scope in Microsoft's sense and needs
 * no verification of the kind Google's does.
 *
 * ## The timezone, which is the one real difference
 *
 * Google returns every instance with its own UTC offset, so the server can turn
 * them into wall-clock hours and be right across a daylight-saving change.
 * CalDAV returns recurrence rules, so the device resolves them. Graph does
 * neither: `calendarView` expands the recurrences for us, which is what we
 * want, but hands back a naive `2026-09-04T09:30:00.0000000` plus a timezone
 * *name*, defaulting to UTC.
 *
 * The fix is Microsoft's own: `Prefer: outlook.timezone="Europe/Madrid"` asks
 * for the expansion in that zone, and then the string is already the wall clock
 * the day needs. So the device sends the zone it is in — which it knows and
 * this process does not — and Microsoft does the daylight-saving arithmetic.
 * That is one more thing travelling than the other two providers need, and it
 * is a timezone name rather than a location: coarser than the five-kilometre
 * cell the events strip already sends, and required for the times to be right.
 */

/** Three weeks, the same window every other calendar path reads. */
const DAYS_AHEAD = 21
/** How many events one pull may carry. A bound, not a rule. */
const MAX_EVENTS = 250
const SCOPE = 'offline_access Calendars.Read'

/** Everything the flow needs from the environment, or null when it is not set up. */
function envConfig() {
  const clientId = $os.getenv('MICROSOFT_CLIENT_ID')
  const clientSecret = $os.getenv('MICROSOFT_CLIENT_SECRET')
  const redirect = $os.getenv('MICROSOFT_REDIRECT_URI')
  const secret = String($os.getenv('CALENDAR_SECRET') || '')
  if (!clientId || !clientSecret || !redirect || secret.length !== 32) return null
  return {
    clientId: clientId,
    clientSecret: clientSecret,
    secret: secret,
    redirect: redirect,
    /* `common` so both work and personal accounts can sign in. A tenant id
       here would lock it to one organisation. */
    authBase: $os.getenv('MICROSOFT_AUTH_BASE_URL') || 'https://login.microsoftonline.com/common',
    apiBase: $os.getenv('MICROSOFT_API_BASE_URL') || 'https://graph.microsoft.com/v1.0',
    appBase: String($os.getenv('APP_BASE_URL') || '').replace(/\/+$/, ''),
  }
}

function form(fields) {
  const parts = []
  for (const key in fields) {
    parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(fields[key]))
  }
  return parts.join('&')
}

function authorizeUrl(base, clientId, redirectUri, state) {
  const params = [
    'client_id=' + encodeURIComponent(clientId),
    'response_type=code',
    'redirect_uri=' + encodeURIComponent(redirectUri),
    'response_mode=query',
    'scope=' + encodeURIComponent(SCOPE),
    'state=' + encodeURIComponent(state),
  ]
  return String(base).replace(/\/+$/, '') + '/oauth2/v2.0/authorize?' + params.join('&')
}

function codeExchangeBody(code, clientId, clientSecret, redirectUri) {
  return form({
    client_id: clientId,
    client_secret: clientSecret,
    code: code,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
    scope: SCOPE,
  })
}

function refreshBody(refreshToken, clientId, clientSecret) {
  return form({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
    scope: SCOPE,
  })
}

/**
 * A timezone name we are willing to put in a header.
 *
 * The device sends this and it goes straight into `Prefer`, so it is checked
 * rather than trusted: IANA names are letters, digits, and the three
 * punctuation marks, and nothing here may carry a quote, a newline or a
 * semicolon into a header.
 */
function isZone(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_+\-/]{3,64}$/.test(value)
}

/** `YYYY-MM-DDTHH:mm:ss`, naive, which is what calendarView's bounds take. */
function stamp(ms) {
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, '')
}

function windowFor(nowMs) {
  return { from: stamp(nowMs), to: stamp(nowMs + DAYS_AHEAD * 24 * 60 * 60 * 1000) }
}

/**
 * The expanded occurrences between two instants.
 *
 * `calendarView` rather than `/events`: it walks the recurrence rules itself
 * and returns instances, which is the same reason Google's read asks for
 * `singleEvents=true`.
 */
function calendarViewUrl(base, window) {
  const params = [
    'startDateTime=' + encodeURIComponent(window.from),
    'endDateTime=' + encodeURIComponent(window.to),
    '$select=subject,start,end,isAllDay,isCancelled,showAs,responseStatus',
    '$orderby=start/dateTime',
    '$top=' + MAX_EVENTS,
  ]
  return String(base).replace(/\/+$/, '') + '/me/calendarView?' + params.join('&')
}

/**
 * One Graph event to one busy block, or null.
 *
 * The exclusions are the ones `lib/ics.ts` argues for and Google's reader
 * repeats, in Graph's vocabulary:
 *
 *   isAllDay          a birthday is not a reason to refuse to train.
 *   showAs free       the calendar itself says this does not block time.
 *   isCancelled       it is not happening.
 *   declined          somebody said no. Their own response is the only
 *                     opinion that counts.
 *
 * The times are read as written, because they were asked for in the member's
 * own zone. An event crossing midnight is clipped to the day it starts on: the
 * planner works one day at a time.
 */
function blockFrom(event) {
  if (!event || event.isCancelled === true || event.isAllDay === true) return null
  if (typeof event.showAs === 'string' && event.showAs.toLowerCase() === 'free') return null
  const answer = event.responseStatus && event.responseStatus.response
  if (typeof answer === 'string' && answer.toLowerCase() === 'declined') return null

  const start = (event.start && event.start.dateTime) || ''
  const end = (event.end && event.end.dateTime) || ''
  const from = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(String(start))
  const to = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(String(end))
  if (!from || !to) return null

  const date = from[1] + '-' + from[2] + '-' + from[3]
  const startClock = from[4] + ':' + from[5]
  const sameDay = to[1] === from[1] && to[2] === from[2] && to[3] === from[3]
  const endClock = sameDay ? to[4] + ':' + to[5] : '23:59'
  if (endClock <= startClock) return null

  return {
    date: date,
    start: startClock,
    end: endClock,
    title:
      typeof event.subject === 'string'
        ? event.subject.replace(/\s+/g, ' ').trim().slice(0, 80)
        : '',
  }
}

/** The whole answer, reduced and bounded. */
function busyFrom(json) {
  const items = json && Array.isArray(json.value) ? json.value : []
  const out = []
  for (const event of items) {
    const block = blockFrom(event)
    if (block) out.push(block)
    if (out.length >= MAX_EVENTS) break
  }
  out.sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start))
  return out
}

/** This account's Microsoft row, or null. */
function linkFor(app, userId) {
  try {
    return app.findFirstRecordByFilter('calendar_links', 'owner = {:o} && provider = {:p}', {
      o: userId,
      p: 'microsoft',
    })
  } catch {
    return null
  }
}

module.exports = {
  SCOPE,
  DAYS_AHEAD,
  MAX_EVENTS,
  envConfig,
  linkFor,
  authorizeUrl,
  codeExchangeBody,
  refreshBody,
  isZone,
  windowFor,
  calendarViewUrl,
  blockFrom,
  busyFrom,
}
