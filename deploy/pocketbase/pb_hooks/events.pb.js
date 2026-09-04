/// <reference path="../pb_data/types.d.ts" />
/**
 * What is on near a member, fetched once per cell and shared.
 *
 * `GET /api/enforma/events/near?geo=<geohash>` or `?city=<name>`. Signed in,
 * and Pro or a platform admin: the call spends a budget of five thousand a day
 * that is ours, and the screen behind it is a paid one. Refused before the key
 * is looked at, so the boundary is provable on a sandbox with no vendor key.
 *
 * The cache is `shared_cache`, the same collection the recipes use, keyed by
 * the cell or the city and good for six hours. That is what turns five
 * thousand into enough: every member in the same five kilometre square reads
 * one answer.
 *
 * The vendor is `TICKETMASTER_BASE_URL` when set, which is how the walk points
 * it at a fake on loopback; otherwise Ticketmaster itself.
 */
routerAdd('GET', '/api/enforma/events/near', (e) => {
  if (!e.auth) return e.json(401, { message: 'Sign in first.' })
  const { isPro, isPlatformAdmin } = require(`${__hooks}/utils/entitlement.js`)
  if (!(isPlatformAdmin(e.app, e.auth.id) || isPro(e.app, e.auth.id))) {
    return e.json(403, { message: 'Part of Pro.' })
  }

  const {
    RADIUS_KM,
    isGeohash,
    windowFor,
    ticketmasterUrl,
    cacheKeyFor,
    isFresh,
    normaliseTicketmaster,
  } = require(`${__hooks}/utils/events.js`)
  const { normaliseArea } = require(`${__hooks}/utils/area.js`)

  const geo = e.request.url.query().get('geo')
  const city = normaliseArea(e.request.url.query().get('city'))
  let query = null
  if (isGeohash(geo)) query = { geo: geo }
  else if (city.length >= 2) query = { city: city }
  if (!query) return e.json(400, { message: 'A cell or a city is required.' })

  const key = $os.getenv('TICKETMASTER_API_KEY')
  if (!key) return e.json(503, { message: 'No events source on this server.' })

  const now = Date.now()
  const cacheKey = cacheKeyFor(query)
  try {
    const row = e.app.findFirstRecordByFilter('shared_cache', 'key = {:key}', { key: cacheKey })
    const held = JSON.parse(toString(row.get('value')))
    if (held && isFresh(held.fetchedAt, now) && Array.isArray(held.events)) {
      return e.json(200, { events: held.events, cached: true, radiusKm: RADIUS_KM })
    }
  } catch {
    /* Nothing held, or nothing readable: ask. */
  }

  const base = $os.getenv('TICKETMASTER_BASE_URL') || 'https://app.ticketmaster.com/discovery/v2'
  let res = null
  try {
    res = $http.send({
      url: ticketmasterUrl(base, key, query, windowFor(now)),
      method: 'GET',
      timeout: 20,
    })
  } catch {
    return e.json(502, { message: 'The events source could not be reached.' })
  }
  if (!res || res.statusCode < 200 || res.statusCode >= 300) {
    return e.json(502, { message: 'The events source answered badly.' })
  }
  const events = normaliseTicketmaster(res.json)

  /* Remembered whole, ours not theirs. A failure to remember is not a failure
     to answer. */
  try {
    let row
    try {
      row = e.app.findFirstRecordByFilter('shared_cache', 'key = {:key}', { key: cacheKey })
    } catch {
      row = new Record(e.app.findCollectionByNameOrId('shared_cache'))
      row.set('key', cacheKey)
    }
    row.set('value', { fetchedAt: new Date(now).toISOString(), events: events })
    e.app.save(row)
  } catch {
    /* Uncached, and still answered. */
  }

  return e.json(200, { events: events, cached: false, radiusKm: RADIUS_KM })
})
