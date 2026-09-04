/**
 * Enough CalDAV to find somebody's calendars and ask them what is on.
 *
 * Apple offers no OAuth, no REST API and no webhooks for iCloud calendars.
 * What it offers is CalDAV over HTTP Basic with an app-specific password the
 * member creates by hand at appleid.apple.com. That is a worse sign-up than
 * Google's and the same result, and it is the only door there is.
 *
 * ## What this server does and does not do
 *
 * It authenticates, discovers, asks, and hands the answer back. **It does not
 * parse iCalendar.** The route returns the `VCALENDAR` text exactly as iCloud
 * sent it and `src/lib/ics.ts` on the member's own device reads it — the same
 * parser the file import has used since v1, already tested, already carrying
 * the decisions about all-day events, `TRANSP`, `STATUS`, `RRULE` and `TZID`.
 *
 * Three things follow from that, and they are the reason for it:
 *
 *   1. Times stay correct. Expanded instances come back from CalDAV in UTC,
 *      and turning UTC into somebody's wall clock needs their timezone across
 *      a three-week window that may contain a daylight-saving change. The
 *      browser has that; this process does not. So the recurrence rules are
 *      left in and the device resolves them.
 *   2. One set of decisions. "Is an all-day birthday busy time?" is answered
 *      once, in `ics.ts`, with the reasoning written next to it.
 *   3. The titles question stays where it already is. The text contains them,
 *      the device decides whether to keep them, and that switch exists.
 *
 * ## XML by regex, deliberately and narrowly
 *
 * There is no XML parser in this runtime. What is extracted is `href` and
 * `calendar-data` from a WebDAV `multistatus`, which is a shallow, known and
 * boring shape, and every helper here is written to return nothing rather than
 * guess when it does not recognise what it is looking at. It is checked
 * against real iCloud-shaped responses in `src/lib/caldav-server.spec.ts`.
 * This would be the wrong technique for arbitrary XML and it is the right size
 * for this.
 */

/** Three weeks, the same window every other calendar path reads. */
const DAYS_AHEAD = 21
/** How many calendars one account's events are collected from. */
const MAX_CALENDARS = 12
/** How much iCalendar text is ever relayed, so one busy account cannot flood a phone. */
const MAX_BYTES = 2 * 1024 * 1024

const ICLOUD = 'https://caldav.icloud.com'

/** Where iCloud lives, or a fake for the walks. */
function davBase() {
  return String($os.getenv('CALDAV_BASE_URL') || ICLOUD).replace(/\/+$/, '')
}

function basic(user, password) {
  /* No btoa in this runtime; the Go side does base64 through the hash helpers,
     so the encoding is done by hand over the bytes. */
  const raw = String(user) + ':' + String(password)
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  let out = ''
  for (let i = 0; i < raw.length; i += 3) {
    const a = raw.charCodeAt(i)
    const b = i + 1 < raw.length ? raw.charCodeAt(i + 1) : NaN
    const c = i + 2 < raw.length ? raw.charCodeAt(i + 2) : NaN
    out += alphabet[a >> 2]
    out += alphabet[((a & 3) << 4) | (Number.isNaN(b) ? 0 : b >> 4)]
    out += Number.isNaN(b) ? '=' : alphabet[((b & 15) << 2) | (Number.isNaN(c) ? 0 : c >> 6)]
    out += Number.isNaN(c) ? '=' : alphabet[c & 63]
  }
  return 'Basic ' + out
}

/* ------------------------------------------------------------ the requests */

const PRINCIPAL_BODY =
  '<?xml version="1.0" encoding="utf-8"?>' +
  '<d:propfind xmlns:d="DAV:"><d:prop><d:current-user-principal/></d:prop></d:propfind>'

const HOME_BODY =
  '<?xml version="1.0" encoding="utf-8"?>' +
  '<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">' +
  '<d:prop><c:calendar-home-set/></d:prop></d:propfind>'

const CALENDARS_BODY =
  '<?xml version="1.0" encoding="utf-8"?>' +
  '<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">' +
  '<d:prop><d:resourcetype/><d:displayname/>' +
  '<c:supported-calendar-component-set/></d:prop></d:propfind>'

/** `YYYYMMDDTHHMMSSZ`, which is the only date format a time-range takes. */
function stamp(ms) {
  return new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

function windowFor(nowMs) {
  return { from: stamp(nowMs), to: stamp(nowMs + DAYS_AHEAD * 24 * 60 * 60 * 1000) }
}

/**
 * The events in one calendar between two instants.
 *
 * No `<C:expand>`: expansion is what would force UTC on the answer and take
 * the timezone away from the device that knows it. The recurrence rules come
 * back as written and `ics.ts` walks them.
 */
function queryBody(window) {
  return (
    '<?xml version="1.0" encoding="utf-8"?>' +
    '<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">' +
    '<d:prop><c:calendar-data/></d:prop>' +
    '<c:filter><c:comp-filter name="VCALENDAR">' +
    '<c:comp-filter name="VEVENT">' +
    '<c:time-range start="' + window.from + '" end="' + window.to + '"/>' +
    '</c:comp-filter></c:comp-filter></c:filter></c:calendar-query>'
  )
}

/* ------------------------------------------------------------ the answers */

/** Namespace prefixes vary by server, so tags are matched without them. */
function tagPattern(local) {
  return new RegExp('<(?:[A-Za-z0-9_.-]+:)?' + local + '[^>]*>([\\s\\S]*?)<\\/(?:[A-Za-z0-9_.-]+:)?' + local + '>', 'i')
}

function tagPatternAll(local) {
  return new RegExp('<(?:[A-Za-z0-9_.-]+:)?' + local + '[^>]*>([\\s\\S]*?)<\\/(?:[A-Za-z0-9_.-]+:)?' + local + '>', 'gi')
}

/** The text of the first `<local>` inside `xml`, trimmed, or ''. */
function firstTag(xml, local) {
  const m = tagPattern(local).exec(String(xml || ''))
  return m ? m[1].trim() : ''
}

/** The path from `<current-user-principal><href>…`, or ''. */
function principalHref(xml) {
  const inside = firstTag(xml, 'current-user-principal')
  return inside ? firstTag(inside, 'href') : ''
}

/** The path from `<calendar-home-set><href>…`, or ''. */
function homeHref(xml) {
  const inside = firstTag(xml, 'calendar-home-set')
  return inside ? firstTag(inside, 'href') : ''
}

/**
 * The calendar collections in a Depth: 1 listing that hold events.
 *
 * A calendar home also contains the home itself, inboxes, outboxes and
 * notification collections, plus calendars that hold only reminders or only
 * birthdays. What is kept is a `<calendar/>` resourcetype whose supported
 * components include `VEVENT`, which is the test that excludes all of them.
 */
function eventCalendars(xml) {
  const out = []
  const responses = String(xml || '').match(tagPatternAll('response')) || []
  for (const response of responses) {
    const href = firstTag(response, 'href')
    if (!href) continue
    const type = firstTag(response, 'resourcetype')
    if (!/<(?:[A-Za-z0-9_.-]+:)?calendar[\s/>]/i.test(type)) continue
    const components = firstTag(response, 'supported-calendar-component-set')
    /**
     * A collection that does not say is taken at its word only when it says
     * nothing at all: iCloud always says, and one that lists components
     * without VEVENT is a reminders list.
     *
     * **The quoting is not ours to choose.** iCloud writes the attribute with
     * single quotes — `<comp name='VTODO' xmlns='...'/>` — and XML says that is
     * the same as double. Matching only double quotes dropped every calendar a
     * real account has, and answered with an empty list rather than an error,
     * so the day stayed blank and nothing anywhere said why. The walk's fake
     * used double quotes and agreed with the bug for as long as it existed.
     */
    if (components && !/name\s*=\s*['"]?VEVENT\b/i.test(components)) continue
    out.push({ href: href, name: firstTag(response, 'displayname') })
    if (out.length >= MAX_CALENDARS) break
  }
  return out
}

/** The iCalendar bodies from a report, XML-unescaped, longest window first. */
function calendarData(xml) {
  const out = []
  const blobs = String(xml || '').match(tagPatternAll('calendar-data')) || []
  for (const blob of blobs) {
    const text = firstTag(blob, 'calendar-data')
    if (!text) continue
    const ical = text
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, '&')
      .trim()
    if (/BEGIN:VCALENDAR/i.test(ical)) out.push(ical)
  }
  return out
}

/** A relative href against the base it came from. */
function absolute(base, href) {
  const clean = String(href || '').trim()
  if (clean === '') return ''
  if (/^https?:\/\//i.test(clean)) return clean
  return String(base).replace(/\/+$/, '') + (clean.startsWith('/') ? clean : '/' + clean)
}

/** Whether a status line means "your Apple ID or password is wrong". */
function isRefusal(status) {
  return status === 401 || status === 403
}

module.exports = {
  DAYS_AHEAD,
  MAX_CALENDARS,
  MAX_BYTES,
  ICLOUD,
  davBase,
  basic,
  PRINCIPAL_BODY,
  HOME_BODY,
  CALENDARS_BODY,
  windowFor,
  queryBody,
  firstTag,
  principalHref,
  homeHref,
  eventCalendars,
  calendarData,
  absolute,
  isRefusal,
}
