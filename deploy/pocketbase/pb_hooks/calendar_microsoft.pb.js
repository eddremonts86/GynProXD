/// <reference path="../pb_data/types.d.ts" />
/**
 * Microsoft Calendar, on the same table and the same shape as Google.
 *
 *   POST /api/enforma/calendar/microsoft/start     → { url }
 *   GET  /api/enforma/calendar/microsoft/callback  → Microsoft lands here
 *   GET  /api/enforma/calendar/microsoft/busy      → the next three weeks
 *
 * Everything structural is Google's and the comments there hold: a POST that
 * answers with a URL rather than a redirect, so no token travels in a query
 * string; a signed ten-minute state as the whole identity check on the
 * callback, which arrives with no session; the refresh token sealed with
 * `CALENDAR_SECRET` into a collection PocketBase serves to nobody; a fresh
 * access token per pull rather than a second secret at rest; and no event ever
 * stored here.
 *
 * The one difference is the timezone, and `utils/microsoft_calendar.js` says
 * why at length: the read asks Graph to expand the recurrences in the member's
 * own zone, which the device sends, because Graph hands back naive times and a
 * zone name rather than an offset per instance.
 */

routerAdd('POST', '/api/enforma/calendar/microsoft/start', (e) => {
  if (!e.auth) return e.json(401, { message: 'Sign in first.' })
  const ms = require(`${__hooks}/utils/microsoft_calendar.js`)
  const { signState, STATE_TTL_MS } = require(`${__hooks}/utils/oauth_state.js`)
  const { isPro, isPlatformAdmin } = require(`${__hooks}/utils/entitlement.js`)
  if (!(isPlatformAdmin(e.app, e.auth.id) || isPro(e.app, e.auth.id))) {
    return e.json(403, { message: 'Part of Pro.' })
  }
  const cfg = ms.envConfig()
  if (!cfg) return e.json(503, { message: 'No calendar connection on this server.' })
  const state = signState(e.auth.id, Date.now() + STATE_TTL_MS, cfg.secret)
  return e.json(200, { url: ms.authorizeUrl(cfg.authBase, cfg.clientId, cfg.redirect, state) })
})

routerAdd('GET', '/api/enforma/calendar/microsoft/callback', (e) => {
  const ms = require(`${__hooks}/utils/microsoft_calendar.js`)
  const { verifyState } = require(`${__hooks}/utils/oauth_state.js`)
  const { isPro, isPlatformAdmin } = require(`${__hooks}/utils/entitlement.js`)
  const cfg = ms.envConfig()
  const back = (word) =>
    e.redirect(302, (cfg && cfg.appBase ? cfg.appBase : '') + '/day?calendar=' + word)
  if (!cfg) return back('unavailable')

  const query = e.request.url.query()
  if (query.get('error')) return back('refused')
  const code = query.get('code')
  const userId = verifyState(query.get('state'), cfg.secret, Date.now())
  if (!code || !userId) return back('failed')

  let user = null
  try {
    user = e.app.findRecordById('users', userId)
  } catch {
    return back('failed')
  }
  if (!(isPlatformAdmin(e.app, user.id) || isPro(e.app, user.id))) return back('failed')

  let res = null
  try {
    res = $http.send({
      url: cfg.authBase.replace(/\/+$/, '') + '/oauth2/v2.0/token',
      method: 'POST',
      body: ms.codeExchangeBody(code, cfg.clientId, cfg.clientSecret, cfg.redirect),
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      timeout: 30,
    })
  } catch {
    return back('failed')
  }
  if (!res || res.statusCode < 200 || res.statusCode >= 300) return back('failed')
  const payload = res.json || {}
  if (!payload.refresh_token) return back('failed')

  /* Who it is, for the one sentence the screen shows. From the id token when
     one came, and left blank otherwise: `Calendars.Read` does not entitle us
     to ask for a profile and we are not going to. */
  let account = ''
  try {
    if (typeof payload.id_token === 'string') {
      const claims = $security.parseUnverifiedJWT(payload.id_token)
      if (claims) {
        const named = claims.preferred_username || claims.email || claims.upn
        if (typeof named === 'string') account = named.slice(0, 200)
      }
    }
  } catch {
    /* No name to show, which is not a reason to fail a connection. */
  }

  try {
    let row = ms.linkFor(e.app, user.id)
    if (!row) {
      row = new Record(e.app.findCollectionByNameOrId('calendar_links'))
      row.set('owner', user.id)
      row.set('provider', 'microsoft')
    }
    row.set('secret', $security.encrypt(String(payload.refresh_token), cfg.secret))
    row.set('account', account)
    row.set('last_synced', '')
    e.app.save(row)
  } catch {
    return back('failed')
  }
  return back('connected')
})

routerAdd('GET', '/api/enforma/calendar/microsoft/busy', (e) => {
  if (!e.auth) return e.json(401, { message: 'Sign in first.' })
  const ms = require(`${__hooks}/utils/microsoft_calendar.js`)
  const { isPro, isPlatformAdmin } = require(`${__hooks}/utils/entitlement.js`)
  if (!(isPlatformAdmin(e.app, e.auth.id) || isPro(e.app, e.auth.id))) {
    return e.json(403, { message: 'Part of Pro.' })
  }
  const cfg = ms.envConfig()
  if (!cfg) return e.json(503, { message: 'No calendar connection on this server.' })
  const row = ms.linkFor(e.app, e.auth.id)
  if (!row) return e.json(404, { message: 'No Microsoft calendar connected.' })

  let refreshToken = ''
  try {
    refreshToken = $security.decrypt(String(row.get('secret')), cfg.secret)
  } catch {
    return e.json(500, { message: 'The stored connection could not be opened.' })
  }

  let tokenRes = null
  try {
    tokenRes = $http.send({
      url: cfg.authBase.replace(/\/+$/, '') + '/oauth2/v2.0/token',
      method: 'POST',
      body: ms.refreshBody(refreshToken, cfg.clientId, cfg.clientSecret),
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      timeout: 30,
    })
  } catch {
    return e.json(502, { message: 'Microsoft could not be reached.' })
  }
  if (!tokenRes || tokenRes.statusCode === 400 || tokenRes.statusCode === 401) {
    return e.json(409, { message: 'This calendar connection was withdrawn. Connect it again.' })
  }
  if (tokenRes.statusCode < 200 || tokenRes.statusCode >= 300) {
    return e.json(502, { message: 'Microsoft answered badly.' })
  }
  const access = (tokenRes.json || {}).access_token
  if (!access) return e.json(502, { message: 'Microsoft answered badly.' })

  /**
   * Microsoft rotates the refresh token on every exchange and the old one stops
   * working, which Google does not do. Missing this would give a connection
   * that reads once and then reports itself withdrawn.
   */
  try {
    const rotated = (tokenRes.json || {}).refresh_token
    if (typeof rotated === 'string' && rotated !== '' && rotated !== refreshToken) {
      row.set('secret', $security.encrypt(rotated, cfg.secret))
    }
  } catch {
    /* Kept the old one, which may still work. */
  }

  /* The zone the device says it is in, checked before it goes in a header. */
  const asked = e.request.url.query().get('tz')
  const zone = ms.isZone(asked) ? asked : 'UTC'

  let eventsRes = null
  try {
    eventsRes = $http.send({
      url: ms.calendarViewUrl(cfg.apiBase, ms.windowFor(Date.now())),
      method: 'GET',
      headers: {
        authorization: 'Bearer ' + access,
        prefer: 'outlook.timezone="' + zone + '"',
      },
      timeout: 30,
    })
  } catch {
    return e.json(502, { message: 'Microsoft could not be reached.' })
  }
  if (!eventsRes || eventsRes.statusCode < 200 || eventsRes.statusCode >= 300) {
    return e.json(502, { message: 'Microsoft answered badly.' })
  }

  const blocks = ms.busyFrom(eventsRes.json)
  const keepTitles = e.request.url.query().get('titles') === '1'
  const out = []
  for (const block of blocks) {
    out.push(keepTitles ? block : { date: block.date, start: block.start, end: block.end, title: '' })
  }

  try {
    row.set('last_synced', new Date().toISOString())
    e.app.save(row)
  } catch {
    /* Bookkeeping only; the answer matters more. */
  }

  return e.json(200, { blocks: out, zone: zone })
})
