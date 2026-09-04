/// <reference path="../pb_data/types.d.ts" />
/**
 * A real calendar, read on the member's behalf.
 *
 * Four routes and one rule between them: **the refresh token never leaves this
 * process**. It arrives from Google, is sealed with `CALENDAR_SECRET` and
 * written to a collection PocketBase serves to nobody, and from then on it is
 * spent here to mint short-lived access tokens. Nothing any client can call
 * returns it, and `/status` deliberately answers with an email address and a
 * date rather than anything that could be replayed.
 *
 *   POST /api/enforma/calendar/google/start   → { url } to send the browser to
 *   GET  /api/enforma/calendar/google/callback → Google lands here, then the app
 *   GET  /api/enforma/calendar/status          → { connected, account, lastSynced }
 *   GET  /api/enforma/calendar/busy            → the next three weeks, as blocks
 *   POST /api/enforma/calendar/disconnect      → forgets it, and tells Google
 *
 * `start` is a POST that answers with a URL rather than a redirect, because a
 * redirect would have to carry the caller's token in a query string to know who
 * it was. The state does that job instead: signed, short-lived, and carrying
 * the account id so the callback trusts the signature rather than a session
 * that may not exist by the time Google comes back.
 *
 * Events are never stored here. They are fetched when asked for, normalised to
 * the busy blocks the day planner already understands, and handed to the device
 * that asked, where the member's day already lives encrypted. This server keeps
 * a token and a date.
 */

/**
 * Every helper these routes share lives in `utils/google_calendar.js` and is
 * required inside each handler, because PocketBase gives every handler its own
 * VM and nothing at this file's top level is visible from inside one. A
 * function defined here and called there fails as a bare 400 with an empty log,
 * which is a morning nobody should spend twice.
 */

routerAdd('POST', '/api/enforma/calendar/google/start', (e) => {
  if (!e.auth) return e.json(401, { message: 'Sign in first.' })
  const { envConfig, signState, authorizeUrl, STATE_TTL_MS } = require(`${__hooks}/utils/google_calendar.js`)
  const { isPro, isPlatformAdmin } = require(`${__hooks}/utils/entitlement.js`)
  if (!(isPlatformAdmin(e.app, e.auth.id) || isPro(e.app, e.auth.id))) {
    return e.json(403, { message: 'Part of Pro.' })
  }
  const cfg = envConfig()
  if (!cfg) return e.json(503, { message: 'No calendar connection on this server.' })
  const state = signState(e.auth.id, Date.now() + STATE_TTL_MS, cfg.secret)
  return e.json(200, { url: authorizeUrl(cfg.authBase, cfg.clientId, cfg.redirect, state) })
})

/**
 * Where Google sends the browser back.
 *
 * No `e.auth` here and there cannot be: this is a top-level navigation from
 * another origin. The signed state is the whole identity check, which is why it
 * carries an expiry and is compared with a constant-time equal.
 *
 * Every ending is a redirect back into the app with a word in the query, so the
 * member lands on their day rather than on a JSON body. The reason is coarse on
 * purpose: "it did not work" is all a URL should carry about somebody's
 * calendar.
 */
routerAdd('GET', '/api/enforma/calendar/google/callback', (e) => {
  const { envConfig, linkFor, verifyState, codeExchangeBody } = require(`${__hooks}/utils/google_calendar.js`)
  const { isPro, isPlatformAdmin } = require(`${__hooks}/utils/entitlement.js`)
  const cfg = envConfig()
  const back = (word) => {
    const to = (cfg && cfg.appBase ? cfg.appBase : '') + '/day?calendar=' + word
    return e.redirect(302, to)
  }
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
      url: cfg.tokenBase.replace(/\/+$/, '') + '/token',
      method: 'POST',
      body: codeExchangeBody(code, cfg.clientId, cfg.clientSecret, cfg.redirect),
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      timeout: 30,
    })
  } catch {
    return back('failed')
  }
  if (!res || res.statusCode < 200 || res.statusCode >= 300) return back('failed')
  const payload = res.json || {}
  if (!payload.refresh_token) return back('failed')

  /* Who it is, for the one sentence the screen shows. Read from the id token's
     payload rather than by asking another endpoint: it is already here, and it
     is not trusted for anything but display. */
  let account = ''
  try {
    if (typeof payload.id_token === 'string') {
      const claims = $security.parseUnverifiedJWT(payload.id_token)
      if (claims && typeof claims.email === 'string') account = claims.email.slice(0, 200)
    }
  } catch {
    /* No name to show, which is not a reason to fail a connection. */
  }

  try {
    let row = linkFor(e.app, user.id)
    if (!row) {
      row = new Record(e.app.findCollectionByNameOrId('calendar_links'))
      row.set('owner', user.id)
      row.set('provider', 'google')
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

routerAdd('GET', '/api/enforma/calendar/status', (e) => {
  if (!e.auth) return e.json(401, { message: 'Sign in first.' })
  const { linkFor } = require(`${__hooks}/utils/google_calendar.js`)
  const row = linkFor(e.app, e.auth.id)
  if (!row) return e.json(200, { connected: false })
  const synced = String(row.get('last_synced') || '')
  return e.json(200, {
    connected: true,
    provider: 'google',
    account: String(row.get('account') || ''),
    lastSynced: synced === '' ? null : synced,
  })
})

/**
 * The next three weeks, as busy blocks.
 *
 * A fresh access token every time rather than a stored one: they last an hour,
 * caching one would mean a second secret at rest, and the exchange costs a
 * round trip on a request that is already making one.
 *
 * Titles are left out unless `?titles=1`. That is the same decision the file
 * import makes and it is the member's to make: reading a title to show it back
 * is not a privacy event, and writing "oncology follow-up" into a record that
 * syncs between devices is.
 */
routerAdd('GET', '/api/enforma/calendar/busy', (e) => {
  if (!e.auth) return e.json(401, { message: 'Sign in first.' })
  const { envConfig, linkFor, refreshBody, eventsUrl, busyFrom } = require(`${__hooks}/utils/google_calendar.js`)
  const { isPro, isPlatformAdmin } = require(`${__hooks}/utils/entitlement.js`)
  if (!(isPlatformAdmin(e.app, e.auth.id) || isPro(e.app, e.auth.id))) {
    return e.json(403, { message: 'Part of Pro.' })
  }
  const cfg = envConfig()
  if (!cfg) return e.json(503, { message: 'No calendar connection on this server.' })
  const row = linkFor(e.app, e.auth.id)
  if (!row) return e.json(404, { message: 'No calendar connected.' })

  let refreshToken = ''
  try {
    refreshToken = $security.decrypt(String(row.get('secret')), cfg.secret)
  } catch {
    return e.json(500, { message: 'The stored connection could not be opened.' })
  }

  let tokenRes = null
  try {
    tokenRes = $http.send({
      url: cfg.tokenBase.replace(/\/+$/, '') + '/token',
      method: 'POST',
      body: refreshBody(refreshToken, cfg.clientId, cfg.clientSecret),
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      timeout: 30,
    })
  } catch {
    return e.json(502, { message: 'Google could not be reached.' })
  }
  /* A revoked or expired grant is the one failure worth naming: the member has
     to reconnect, and a generic "try again" would send them round a loop. */
  if (!tokenRes || tokenRes.statusCode === 400 || tokenRes.statusCode === 401) {
    return e.json(409, { message: 'This calendar connection was withdrawn. Connect it again.' })
  }
  if (tokenRes.statusCode < 200 || tokenRes.statusCode >= 300) {
    return e.json(502, { message: 'Google answered badly.' })
  }
  const access = (tokenRes.json || {}).access_token
  if (!access) return e.json(502, { message: 'Google answered badly.' })

  let eventsRes = null
  try {
    eventsRes = $http.send({
      url: eventsUrl(cfg.apiBase, Date.now()),
      method: 'GET',
      headers: { authorization: 'Bearer ' + access },
      timeout: 30,
    })
  } catch {
    return e.json(502, { message: 'Google could not be reached.' })
  }
  if (!eventsRes || eventsRes.statusCode < 200 || eventsRes.statusCode >= 300) {
    return e.json(502, { message: 'Google answered badly.' })
  }

  const blocks = busyFrom(eventsRes.json)
  const keepTitles = e.request.url.query().get('titles') === '1'
  const out = []
  for (const block of blocks) {
    out.push(
      keepTitles
        ? block
        : { date: block.date, start: block.start, end: block.end, title: '' },
    )
  }

  try {
    row.set('last_synced', new Date().toISOString())
    e.app.save(row)
  } catch {
    /* Bookkeeping only; the answer matters more. */
  }

  return e.json(200, { blocks: out })
})

/**
 * Forgetting it, here and at Google.
 *
 * The row goes first: whatever Google says, this server must stop holding a
 * token the moment somebody asks it to. The revoke is best effort afterwards,
 * because a network failure must not leave the member still connected on a
 * screen that told them they were not.
 */
routerAdd('POST', '/api/enforma/calendar/disconnect', (e) => {
  if (!e.auth) return e.json(401, { message: 'Sign in first.' })
  const { envConfig, linkFor } = require(`${__hooks}/utils/google_calendar.js`)
  const row = linkFor(e.app, e.auth.id)
  if (!row) return e.json(200, { connected: false })

  const cfg = envConfig()
  let token = ''
  try {
    if (cfg) token = $security.decrypt(String(row.get('secret')), cfg.secret)
  } catch {
    /* Unopenable, and about to be deleted anyway. */
  }
  try {
    e.app.delete(row)
  } catch {
    return e.json(500, { message: 'It could not be forgotten. Try again.' })
  }
  if (cfg && token) {
    try {
      $http.send({
        url: cfg.tokenBase.replace(/\/+$/, '') + '/revoke',
        method: 'POST',
        body: 'token=' + encodeURIComponent(token),
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        timeout: 15,
      })
    } catch {
      /* Told nobody, holding nothing. */
    }
  }
  return e.json(200, { connected: false })
})
