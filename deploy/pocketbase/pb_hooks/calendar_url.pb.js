/// <reference path="../pb_data/types.d.ts" />
/**
 * Subscribing to a published calendar, which is the way in that asks for no
 * password at all.
 *
 *   POST /api/enforma/calendar/url/connect  → { name } once it has been read
 *   GET  /api/enforma/calendar/url/ics      → the iCalendar, for the device
 *
 * Everything else it needs already exists: `/status` reports it beside the
 * other providers, `/disconnect?provider=url` forgets it, and the device parses
 * the iCalendar with the reader the file import has used since v1.
 *
 * **Why the server fetches it rather than the browser.** The address is a
 * credential and belongs where the others are — sealed in a collection
 * PocketBase serves to nobody. A browser fetch would also be refused: the
 * production CSP allows no arbitrary host, and no publisher sends CORS headers.
 *
 * **The address is never given back.** `/status` answers with a host and a
 * calendar name, the same way the OAuth providers answer with an email address.
 * A published URL is a bearer token wearing a path.
 */

routerAdd('POST', '/api/enforma/calendar/url/connect', (e) => {
  if (!e.auth) return e.json(401, { message: 'Sign in first.' })
  const { envConfig } = require(`${__hooks}/utils/google_calendar.js`)
  const { isPro, isPlatformAdmin } = require(`${__hooks}/utils/entitlement.js`)
  const lib = require(`${__hooks}/utils/calendar_url.js`)
  const { coachHostFor } = require(`${__hooks}/utils/coach_host.js`)
  if (!(isPlatformAdmin(e.app, e.auth.id) || isPro(e.app, e.auth.id))) {
    return e.json(403, { message: 'Part of Pro.' })
  }
  const cfg = envConfig()
  const secret = cfg ? cfg.secret : String($os.getenv('CALENDAR_SECRET') || '')
  if (secret.length !== 32) {
    return e.json(503, { message: 'No calendar connection on this server.' })
  }

  /**
   * Loopback and the private ranges are refused unless this says otherwise,
   * and it exists for the walks — which serve a fake published calendar on
   * 127.0.0.1 and could not otherwise be written at all. It must not be set in
   * production: with it, anybody who can sign in can ask this server to fetch
   * from its own network and tell them whether it worked.
   */
  const allowLocal = String($os.getenv('CALENDAR_URL_ALLOW_LOCAL') || '') === '1'

  const body = e.requestInfo().body || {}
  const url = lib.normalizeUrl(body.url, coachHostFor, allowLocal)
  if (!url) {
    return e.json(400, {
      message: 'That does not look like a published calendar address. It should start with webcal:// or https://.',
    })
  }

  /* Read it once before storing it. An address that cannot be fetched, or that
     answers with a web page, is a mistake worth catching while the member is
     still looking at the field they pasted it into. */
  let res = null
  try {
    res = $http.send({ url: url, method: 'GET', timeout: 30 })
  } catch {
    return e.json(502, { message: 'That address could not be reached.' })
  }
  if (!res || res.statusCode === 401 || res.statusCode === 403) {
    return e.json(401, { message: 'That calendar is not published for anyone with the link.' })
  }
  if (res.statusCode === 404) {
    return e.json(404, { message: 'There is no calendar at that address.' })
  }
  if (res.statusCode < 200 || res.statusCode >= 300) {
    return e.json(502, { message: 'That address answered badly.' })
  }
  const text = String(res.raw || '')
  if (text.length > lib.MAX_BYTES) {
    return e.json(413, { message: 'That calendar is too large to read.' })
  }
  if (!lib.looksLikeCalendar(text)) {
    return e.json(422, { message: 'That address answered with something that is not a calendar.' })
  }

  const name = lib.calendarName(text) || lib.hostLabel(url)
  try {
    let row = null
    try {
      row = e.app.findFirstRecordByFilter('calendar_links', 'owner = {:o} && provider = "url"', {
        o: e.auth.id,
      })
    } catch {
      row = null
    }
    if (!row) {
      row = new Record(e.app.findCollectionByNameOrId('calendar_links'))
      row.set('owner', e.auth.id)
      row.set('provider', 'url')
    }
    row.set('secret', $security.encrypt(url, secret))
    row.set('account', name)
    row.set('last_synced', '')
    row.set('changed_at', '')
    e.app.save(row)
  } catch {
    return e.json(500, { message: 'It could not be saved. Try again.' })
  }
  return e.json(200, { name: name })
})

/**
 * The calendar itself, relayed.
 *
 * The whole file rather than a window, because a published address takes no
 * filter — there is no time-range query to send. The device narrows it to the
 * three weeks it draws, with the reader that has always done that for a picked
 * file.
 */
routerAdd('GET', '/api/enforma/calendar/url/ics', (e) => {
  if (!e.auth) return e.json(401, { message: 'Sign in first.' })
  const { envConfig } = require(`${__hooks}/utils/google_calendar.js`)
  const { isPro, isPlatformAdmin } = require(`${__hooks}/utils/entitlement.js`)
  const lib = require(`${__hooks}/utils/calendar_url.js`)
  if (!(isPlatformAdmin(e.app, e.auth.id) || isPro(e.app, e.auth.id))) {
    return e.json(403, { message: 'Part of Pro.' })
  }
  const cfg = envConfig()
  const secret = cfg ? cfg.secret : String($os.getenv('CALENDAR_SECRET') || '')
  if (secret.length !== 32) {
    return e.json(503, { message: 'No calendar connection on this server.' })
  }

  let row = null
  try {
    row = e.app.findFirstRecordByFilter('calendar_links', 'owner = {:o} && provider = "url"', {
      o: e.auth.id,
    })
  } catch {
    return e.json(404, { message: 'No calendar subscription.' })
  }

  let url = ''
  try {
    url = $security.decrypt(String(row.get('secret')), secret)
  } catch {
    return e.json(500, { message: 'The stored connection could not be opened.' })
  }

  let res = null
  try {
    res = $http.send({ url: url, method: 'GET', timeout: 30 })
  } catch {
    return e.json(502, { message: 'That address could not be reached.' })
  }
  /* A calendar that stopped being published is the one failure worth naming:
     the member has to publish it again or paste a new address, and a generic
     "try again" would send them round a loop. */
  if (!res || res.statusCode === 401 || res.statusCode === 403 || res.statusCode === 404) {
    return e.json(409, { message: 'That calendar is no longer published. Subscribe again.' })
  }
  if (res.statusCode < 200 || res.statusCode >= 300) {
    return e.json(502, { message: 'That address answered badly.' })
  }
  const text = String(res.raw || '')
  if (text.length > lib.MAX_BYTES) return e.json(413, { message: 'That calendar is too large to read.' })
  if (!lib.looksLikeCalendar(text)) {
    return e.json(422, { message: 'That address answered with something that is not a calendar.' })
  }

  try {
    row.set('last_synced', new Date().toISOString())
    e.app.save(row)
  } catch {
    /* Bookkeeping only; the answer matters more. */
  }
  return e.json(200, { ics: [text] })
})
