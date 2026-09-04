/// <reference path="../pb_data/types.d.ts" />
/**
 * Apple Calendar, over CalDAV, on the same table as Google.
 *
 *   POST /api/enforma/calendar/apple/connect  { appleId, password }
 *   GET  /api/enforma/calendar/apple/ics      → { ics: [ "BEGIN:VCALENDAR…" ] }
 *
 * There is no OAuth for iCloud calendars, so what is stored is an
 * **app-specific password** the member generated at appleid.apple.com and
 * typed in. That is a worse thing to hold than a scoped refresh token and it is
 * held the same way: sealed with `CALENDAR_SECRET` into `calendar_links`, a
 * collection PocketBase serves to nobody, returned by no route. Revoking it is
 * one click in their Apple ID and does not need us.
 *
 * The connect route verifies before it stores. An Apple ID and password that
 * do not work are refused at the form rather than accepted and discovered to
 * be useless on the first read, because a member who typed their normal Apple
 * password instead of an app-specific one needs telling now.
 *
 * **This process never parses iCalendar.** The read returns the `VCALENDAR`
 * text as iCloud sent it and the device parses it with `src/lib/ics.ts`.
 * `utils/caldav.js` says at length why, and the short version is that turning
 * a recurrence rule into wall-clock hours needs a timezone database this
 * process does not have and the browser does.
 */

routerAdd('POST', '/api/enforma/calendar/apple/connect', (e) => {
  if (!e.auth) return e.json(401, { message: 'Sign in first.' })
  const { envConfig } = require(`${__hooks}/utils/google_calendar.js`)
  const { isPro, isPlatformAdmin } = require(`${__hooks}/utils/entitlement.js`)
  const dav = require(`${__hooks}/utils/caldav.js`)
  if (!(isPlatformAdmin(e.app, e.auth.id) || isPro(e.app, e.auth.id))) {
    return e.json(403, { message: 'Part of Pro.' })
  }
  /* Only the sealing key is needed here: Apple has no client credentials, so
     `envConfig` is asked for its secret and nothing else. */
  const cfg = envConfig()
  const secret = cfg ? cfg.secret : String($os.getenv('CALENDAR_SECRET') || '')
  if (secret.length !== 32) {
    return e.json(503, { message: 'No calendar connection on this server.' })
  }

  let body = {}
  try {
    body = JSON.parse(readerToString(e.request.body)) || {}
  } catch {
    return e.json(400, { message: 'Send an Apple ID and an app-specific password.' })
  }
  const appleId = String(body.appleId || '').trim()
  const password = String(body.password || '').trim()
  if (!/^[^@\s]+@[^@\s]+$/.test(appleId) || password.length < 8) {
    return e.json(400, { message: 'That does not look like an Apple ID and an app-specific password.' })
  }

  const base = dav.davBase()
  const auth = dav.basic(appleId, password)
  const ask = (url, method, xml, depth) =>
    $http.send({
      url: url,
      method: method,
      body: xml,
      headers: {
        'content-type': 'application/xml; charset=utf-8',
        authorization: auth,
        depth: String(depth),
      },
      timeout: 30,
    })

  /* One PROPFIND is the whole verification: it either comes back with a
     principal or it comes back 401. */
  let res = null
  try {
    res = ask(base + '/', 'PROPFIND', dav.PRINCIPAL_BODY, 0)
  } catch {
    return e.json(502, { message: 'iCloud could not be reached.' })
  }
  if (dav.isRefusal(res.statusCode)) {
    return e.json(401, {
      message: 'iCloud refused that. An app-specific password is not the same as your Apple ID password.',
    })
  }
  if (res.statusCode < 200 || res.statusCode >= 300) {
    return e.json(502, { message: 'iCloud answered badly.' })
  }
  const principal = dav.principalHref(String(res.raw || ''))
  if (!principal) return e.json(502, { message: 'iCloud did not say where the calendars are.' })

  /* The home is discovered now and stored, so a read is two requests rather
     than four. It is a path, not a secret. */
  let home = ''
  try {
    const homeRes = ask(dav.absolute(base, principal), 'PROPFIND', dav.HOME_BODY, 0)
    if (homeRes.statusCode >= 200 && homeRes.statusCode < 300) {
      home = dav.homeHref(String(homeRes.raw || ''))
    }
  } catch {
    /* Discovered again on the first read. */
  }

  try {
    let row = null
    try {
      row = e.app.findFirstRecordByFilter('calendar_links', 'owner = {:o} && provider = {:p}', {
        o: e.auth.id,
        p: 'apple',
      })
    } catch {
      row = new Record(e.app.findCollectionByNameOrId('calendar_links'))
      row.set('owner', e.auth.id)
      row.set('provider', 'apple')
    }
    row.set('secret', $security.encrypt(password, secret))
    row.set('account', appleId.slice(0, 200))
    /* The one field on this table that is a path rather than a credential. */
    row.set('home', home)
    row.set('last_synced', '')
    e.app.save(row)
  } catch {
    return e.json(500, { message: 'The connection could not be saved.' })
  }
  return e.json(200, { connected: true, account: appleId })
})

routerAdd('GET', '/api/enforma/calendar/apple/ics', (e) => {
  if (!e.auth) return e.json(401, { message: 'Sign in first.' })
  const { envConfig } = require(`${__hooks}/utils/google_calendar.js`)
  const { isPro, isPlatformAdmin } = require(`${__hooks}/utils/entitlement.js`)
  const dav = require(`${__hooks}/utils/caldav.js`)
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
    row = e.app.findFirstRecordByFilter('calendar_links', 'owner = {:o} && provider = {:p}', {
      o: e.auth.id,
      p: 'apple',
    })
  } catch {
    return e.json(404, { message: 'No Apple calendar connected.' })
  }

  let password = ''
  try {
    password = $security.decrypt(String(row.get('secret')), secret)
  } catch {
    return e.json(500, { message: 'The stored connection could not be opened.' })
  }

  const base = dav.davBase()
  const auth = dav.basic(String(row.get('account') || ''), password)
  const ask = (url, method, xml, depth) =>
    $http.send({
      url: url,
      method: method,
      body: xml,
      headers: {
        'content-type': 'application/xml; charset=utf-8',
        authorization: auth,
        depth: String(depth),
      },
      timeout: 30,
    })

  /* The home, from the row when the connect stored one and rediscovered when
     it did not. Apple moves nobody's home, so this is a cache with no
     invalidation problem. */
  let home = String(row.get('home') || '')
  try {
    if (!home) {
      const principalRes = ask(base + '/', 'PROPFIND', dav.PRINCIPAL_BODY, 0)
      if (dav.isRefusal(principalRes.statusCode)) {
        return e.json(409, { message: 'iCloud is refusing that password now. Connect it again.' })
      }
      const principal = dav.principalHref(String(principalRes.raw || ''))
      if (!principal) return e.json(502, { message: 'iCloud answered badly.' })
      const homeRes = ask(dav.absolute(base, principal), 'PROPFIND', dav.HOME_BODY, 0)
      home = dav.homeHref(String(homeRes.raw || ''))
    }
  } catch {
    return e.json(502, { message: 'iCloud could not be reached.' })
  }
  if (!home) return e.json(502, { message: 'iCloud did not say where the calendars are.' })

  let calendars = []
  try {
    const listRes = ask(dav.absolute(base, home), 'PROPFIND', dav.CALENDARS_BODY, 1)
    if (dav.isRefusal(listRes.statusCode)) {
      return e.json(409, { message: 'iCloud is refusing that password now. Connect it again.' })
    }
    if (listRes.statusCode < 200 || listRes.statusCode >= 300) {
      return e.json(502, { message: 'iCloud answered badly.' })
    }
    calendars = dav.eventCalendars(String(listRes.raw || ''))
  } catch {
    return e.json(502, { message: 'iCloud could not be reached.' })
  }
  if (calendars.length === 0) return e.json(200, { ics: [], calendars: 0 })

  const window = dav.windowFor(Date.now())
  const query = dav.queryBody(window)
  const out = []
  let bytes = 0
  for (const calendar of calendars) {
    if (bytes >= dav.MAX_BYTES) break
    let reportRes = null
    try {
      reportRes = ask(dav.absolute(base, calendar.href), 'REPORT', query, 1)
    } catch {
      /* One calendar out of several failing is not the whole read failing. */
      continue
    }
    if (!reportRes || reportRes.statusCode < 200 || reportRes.statusCode >= 300) continue
    for (const ical of dav.calendarData(String(reportRes.raw || ''))) {
      if (bytes + ical.length > dav.MAX_BYTES) break
      bytes += ical.length
      out.push(ical)
    }
  }

  try {
    row.set('last_synced', new Date().toISOString())
    e.app.save(row)
  } catch {
    /* Bookkeeping only; the answer matters more. */
  }

  /* The iCalendar text, unparsed, for the device to read. It carries titles;
     the switch that decides whether they are kept lives on that device. */
  return e.json(200, { ics: out, calendars: calendars.length })
})
