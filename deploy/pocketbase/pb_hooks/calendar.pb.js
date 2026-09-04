/// <reference path="../pb_data/types.d.ts" />
/**
 * A real calendar, read on the member's behalf.
 *
 * Five routes and one rule between them: **the refresh token never leaves this
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
 *   POST /api/enforma/calendar/google/notify   → Google says the calendar moved
 *
 * The last one is the only route here with no session behind it and no session
 * it could have: it is Google talking, not a member. What makes it trustworthy
 * is the signed token the channel was opened with, plus the channel id matching
 * the one on the row. What it does is write a date. Nothing about somebody's
 * calendar is read on the strength of a notification — the device re-reads,
 * because the device is the only thing that holds their day.
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
  const { envConfig, authorizeUrl } = require(`${__hooks}/utils/google_calendar.js`)
  const { signState, STATE_TTL_MS } = require(`${__hooks}/utils/oauth_state.js`)
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
  const { envConfig, linkFor, codeExchangeBody } = require(`${__hooks}/utils/google_calendar.js`)
  const { verifyState } = require(`${__hooks}/utils/oauth_state.js`)
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

  let saved = null
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
    row.set('changed_at', '')
    e.app.save(row)
    saved = row
  } catch {
    return back('failed')
  }

  /**
   * Ask Google to push, and do not care much whether it agreed.
   *
   * A reconnection lands here too, which is why `openChannel` closes whatever
   * the row had before opening a new one: the same calendar pushing down two
   * channels would have every change acted on twice.
   *
   * Nothing about the connection depends on this working. A server with no
   * `GOOGLE_WATCH_ADDRESS`, or a domain Google has not verified, gives a member
   * a calendar that reads when they ask it to, which is the whole of what this
   * feature was before the channel existed.
   */
  try {
    const { openChannel } = require(`${__hooks}/utils/google_watch.js`)
    openChannel(e.app, cfg, saved, Date.now())
  } catch {
    /* Connected, unwatched. */
  }
  return back('connected')
})

/**
 * What this account has connected, per provider.
 *
 * One row per provider, so the answer is a map rather than a boolean: a member
 * may have Google on one calendar and iCloud on another, and the screen draws
 * both blocks whatever the other one says. `connected` stays at the top level
 * as "any of them", because that is what the older client asked for and a
 * client that has not been reloaded should keep working.
 */
routerAdd('GET', '/api/enforma/calendar/status', (e) => {
  if (!e.auth) return e.json(401, { message: 'Sign in first.' })
  const one = (provider) => {
    let row = null
    try {
      row = e.app.findFirstRecordByFilter('calendar_links', 'owner = {:o} && provider = {:p}', {
        o: e.auth.id,
        p: provider,
      })
    } catch {
      return { connected: false }
    }
    const synced = String(row.get('last_synced') || '')
    const changed = String(row.get('changed_at') || '')
    return {
      connected: true,
      account: String(row.get('account') || ''),
      lastSynced: synced === '' ? null : synced,
      /**
       * There is news: Google said this calendar changed and no read has
       * answered it yet. The screen that asks for status on the way in reads
       * this and pulls once, which is the difference between a moved meeting
       * appearing and a member having to know to press a button.
       *
       * A date rather than a boolean because it costs nothing and a stale one
       * can be argued with. Only Google can set it; the other two answer null
       * and their panels are identical to what they were.
       */
      changed: changed === '' ? null : changed,
    }
  }
  const google = one('google')
  const apple = one('apple')
  const microsoft = one('microsoft')
  const first = [google, apple, microsoft].find((p) => p.connected)
  return e.json(200, {
    connected: !!first,
    provider: google.connected ? 'google' : apple.connected ? 'apple' : microsoft.connected ? 'microsoft' : null,
    /* Kept flat as well as nested, so the fields the first version answered
       with still mean what they meant. */
    account: first ? first.account : '',
    lastSynced: first ? first.lastSynced : null,
    providers: { google: google, apple: apple, microsoft: microsoft },
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
    /* The news has been answered. Cleared after the events are in hand rather
       than when the request arrived, so a read that failed halfway leaves the
       change still outstanding and the next screen still pulls. */
    row.set('changed_at', '')
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
  const { envConfig } = require(`${__hooks}/utils/google_calendar.js`)
  /* Which one, defaulting to Google: that is what the route meant when it was
     the only provider and what a client that has not reloaded still means. */
  const asked = e.request.url.query().get('provider')
  const provider = asked === 'apple' || asked === 'microsoft' ? asked : 'google'
  let row = null
  try {
    row = e.app.findFirstRecordByFilter('calendar_links', 'owner = {:o} && provider = {:p}', {
      o: e.auth.id,
      p: provider,
    })
  } catch {
    return e.json(200, { connected: false })
  }

  const cfg = envConfig()
  let token = ''
  try {
    if (cfg) token = $security.decrypt(String(row.get('secret')), cfg.secret)
  } catch {
    /* Unopenable, and about to be deleted anyway. */
  }
  /**
   * Close the channel while the token still works.
   *
   * It has to happen before the revoke below and before the row is deleted: a
   * channel is closed with an access token minted from this refresh token, and
   * once Google has been told to forget the grant there is nothing left to mint
   * one with. A channel left open pushes for up to a week at a server that can
   * no longer attribute the notifications, which is only noise — but it is
   * noise aimed at somebody who asked to be forgotten.
   */
  if (provider === 'google' && cfg) {
    try {
      require(`${__hooks}/utils/google_watch.js`).dropChannel(cfg, row)
    } catch {
      /* Told nobody. The channel expires on its own. */
    }
  }
  try {
    e.app.delete(row)
  } catch {
    return e.json(500, { message: 'It could not be forgotten. Try again.' })
  }
  /**
   * Only Google gets told. An app-specific password is revoked by the member in
   * their own Apple ID settings and there is no endpoint to ask, and Microsoft
   * has no revoke endpoint for a refresh token either; deleting the row is the
   * whole of what this server can do, and the screens say so.
   */
  if (provider === 'google' && cfg && token) {
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

/**
 * Google, saying a calendar changed.
 *
 * A thin notification: headers and an empty body. It names the channel, echoes
 * the token the channel was opened with, and says what happened in
 * `X-Goog-Resource-State`. It carries no events, which is the whole reason this
 * is cheap enough to want — the answer to it is a date on a row, and the device
 * does the reading.
 *
 * **Two things have to agree before it is believed.** The token must verify
 * against `CALENDAR_SECRET` and still be inside its window, which is what names
 * the account; and the channel id must match the one currently on that
 * account's row, compared in constant time. The second is what makes a
 * yesterday's channel useless: every renewal replaces the id, so a notification
 * for a channel that has been rolled is dropped even though its signature is
 * still good.
 *
 * **Always 200.** Google retries anything else with a backoff, and there is
 * nothing to retry: either this was a notification we could attribute, in which
 * case it is recorded, or it was not, in which case saying so would only tell
 * whoever sent it which halves of their guess were right. The one visible
 * consequence of a forgery that got through would be one extra calendar read on
 * the member's next screen.
 */
routerAdd('POST', '/api/enforma/calendar/google/notify', (e) => {
  const done = () => e.json(200, { ok: true })
  const { envConfig } = require(`${__hooks}/utils/google_calendar.js`)
  const { verifyState } = require(`${__hooks}/utils/oauth_state.js`)
  const cfg = envConfig()
  if (!cfg) return done()

  const channel = String(e.request.header.get('X-Goog-Channel-Id') || '')
  const token = String(e.request.header.get('X-Goog-Channel-Token') || '')
  const state = String(e.request.header.get('X-Goog-Resource-State') || '')
  if (!channel || !token) return done()

  const userId = verifyState(token, cfg.secret, Date.now())
  if (!userId) return done()

  let row = null
  try {
    row = e.app.findFirstRecordByFilter('calendar_links', 'owner = {:o} && provider = "google"', {
      o: userId,
    })
  } catch {
    return done()
  }
  if (!$security.equal(String(row.get('channel') || ''), channel)) return done()

  /* `sync` is Google acknowledging the channel, sent once when it opens. It
     means nothing changed, and treating it as news would have every member
     pull once for nothing every time a channel is renewed. */
  if (state === 'sync') return done()

  try {
    row.set('changed_at', new Date().toISOString())
    e.app.save(row)
  } catch {
    /* Nothing to say to Google about it either way. */
  }
  return done()
})

/**
 * Channels expire, so something has to replace them.
 *
 * Hourly, against a margin a day wide: the work is one request per member whose
 * channel is nearly gone, most ticks do nothing, and a server that was asleep
 * or redeploying through the window still catches it on the next one.
 *
 * It also picks up links that have no channel at all, which is how a connection
 * made while `GOOGLE_WATCH_ADDRESS` was unset — or one whose watch failed at
 * connect time — starts being pushed to without anybody repairing it by hand.
 */
cronAdd('calendarWatchRenew', '23 * * * *', () => {
  const { renewAll } = require(`${__hooks}/utils/google_watch.js`)
  const result = renewAll($app, Date.now())
  if (!result.skipped && (result.renewed || result.failed)) {
    console.log('[calendar] channels', JSON.stringify(result))
  }
})
