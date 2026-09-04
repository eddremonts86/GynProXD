/**
 * What is on near somebody, from the one public source that still answers.
 *
 * Ticketmaster's Discovery API: a free key, five thousand calls a day, search
 * by a geohash cell and a radius or by a city name. Facebook closed its events
 * search in 2018 and Eventbrite its in 2020; this is what is left that does not
 * cost money per member, and it is ticketed events only. The screen says so.
 *
 * Everything here is pure so it can be tested from the app's own suite, the way
 * `coach_host.js` is: the route in `events.pb.js` reads the query, checks who
 * is asking, fetches, and hands the vendor's answer to `normaliseTicketmaster`.
 * The client never sees the vendor's shape, and the cache stores ours.
 *
 * A geohash rather than coordinates, on purpose. The browser rounds a position
 * to a cell of about five kilometres a side before it leaves the device, and
 * the cell is all this server or the vendor ever learns. It is also the cache
 * key, so a city of members costs one call an afternoon rather than one each.
 */

/** Precision four to seven: from a district to a street. Five is what the app sends. */
function isGeohash(value) {
  return typeof value === 'string' && /^[0-9b-hjkmnp-z]{4,7}$/.test(value)
}

const RADIUS_KM = 25
const DAYS_AHEAD = 14
const MAX_EVENTS = 20
const TTL_MS = 6 * 60 * 60 * 1000

/** Ticketmaster wants `YYYY-MM-DDTHH:mm:ssZ`, with no milliseconds. */
function stamp(date) {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z')
}

/** From now to a fortnight out. */
function windowFor(now) {
  const from = new Date(now)
  const to = new Date(now + DAYS_AHEAD * 24 * 60 * 60 * 1000)
  return { from: stamp(from), to: stamp(to) }
}

/**
 * The vendor URL for one query. `geo` and `city` are exclusive and the caller
 * has validated whichever it passes.
 */
function ticketmasterUrl(base, key, query, window) {
  const params = [
    'apikey=' + encodeURIComponent(key),
    'startDateTime=' + encodeURIComponent(window.from),
    'endDateTime=' + encodeURIComponent(window.to),
    'size=' + MAX_EVENTS,
    'sort=date,asc',
    'locale=*',
  ]
  if (query.geo) {
    params.push('geoPoint=' + encodeURIComponent(query.geo))
    params.push('radius=' + RADIUS_KM)
    params.push('unit=km')
  } else {
    params.push('city=' + encodeURIComponent(query.city))
  }
  return String(base).replace(/\/+$/, '') + '/events.json?' + params.join('&')
}

function cacheKeyFor(query) {
  return query.geo ? 'tm:v1:g:' + query.geo : 'tm:v1:c:' + query.city
}

function isFresh(fetchedAt, now) {
  const at = Date.parse(fetchedAt || '')
  return Number.isFinite(at) && now - at < TTL_MS
}

function text(value, max) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : ''
}

/**
 * The vendor's answer, reduced to what a day can use.
 *
 * An event with no date is dropped: there is nothing to put it on. One with no
 * time is kept, because "the fair is on Saturday" is worth knowing, and the
 * client refuses to place it on an hour it does not have. Only https ticket
 * links survive, so nothing here can hand the browser a scheme it did not
 * expect.
 */
function normaliseTicketmaster(json, limit) {
  const list =
    json && json._embedded && Array.isArray(json._embedded.events) ? json._embedded.events : []
  const out = []
  for (const ev of list) {
    if (!ev || typeof ev.id !== 'string' || typeof ev.name !== 'string') continue
    const start = (ev.dates && ev.dates.start) || {}
    if (typeof start.localDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(start.localDate)) continue
    const venue = (ev._embedded && ev._embedded.venues && ev._embedded.venues[0]) || {}
    const first = (ev.classifications && ev.classifications[0]) || {}
    const segment = (first.segment && first.segment.name) || ''
    out.push({
      id: ev.id,
      name: text(ev.name, 80),
      date: start.localDate,
      time:
        typeof start.localTime === 'string' && /^\d\d:\d\d/.test(start.localTime)
          ? start.localTime.slice(0, 5)
          : null,
      venue: text(venue.name, 60),
      city: text(venue.city && venue.city.name, 40),
      segment: text(segment, 30),
      url: typeof ev.url === 'string' && /^https:\/\//.test(ev.url) ? ev.url : '',
    })
  }
  out.sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')))
  return out.slice(0, limit || MAX_EVENTS)
}

module.exports = {
  RADIUS_KM,
  DAYS_AHEAD,
  MAX_EVENTS,
  TTL_MS,
  isGeohash,
  windowFor,
  ticketmasterUrl,
  cacheKeyFor,
  isFresh,
  normaliseTicketmaster,
}
