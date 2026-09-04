/**
 * Opening, closing and replacing the channel Google pushes down.
 *
 * Separate from `google_calendar.js` because that file is pure and its spec
 * evaluates it directly; this one talks. The pure half decides what a request
 * looks like and when a channel is due, and everything here is the talking.
 *
 * **What a channel is worth, and what it is not.** A notification from Google
 * carries no events — it says "something in this calendar changed" and nothing
 * more, which is exactly as much as this server wants to know. It writes
 * `changed_at` on the link and stops. The device is what re-reads, because the
 * device is the only thing that holds the member's day.
 *
 * **A watch is best effort, everywhere it is attempted.** A member whose
 * channel could not be opened is a member with a working calendar and a button
 * that says "Read it again", which is what everybody had before any of this
 * existed. Failing a connection over it would trade a whole feature for an
 * optimisation.
 */

const CAL = `${__hooks}/utils/google_calendar.js`
const STATE = `${__hooks}/utils/oauth_state.js`

/**
 * A short-lived access token from a stored refresh token.
 *
 * `/busy` mints its own inline, because it has to turn a refused grant into the
 * one 409 the client knows how to explain and this cannot see the response. If
 * a third caller ever needs one, this is the copy to promote.
 */
function mintAccess(cfg, refreshToken) {
  const { refreshBody } = require(CAL)
  let res = null
  try {
    res = $http.send({
      url: cfg.tokenBase.replace(/\/+$/, '') + '/token',
      method: 'POST',
      body: refreshBody(refreshToken, cfg.clientId, cfg.clientSecret),
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      timeout: 30,
    })
  } catch {
    return ''
  }
  if (!res || res.statusCode < 200 || res.statusCode >= 300) return ''
  return String((res.json || {}).access_token || '')
}

/** Tell Google to stop pushing to a channel. Best effort, and never throws. */
function closeChannel(cfg, access, channel, resource) {
  if (!access || !channel || !resource) return false
  const { stopUrl, stopBody } = require(CAL)
  try {
    const res = $http.send({
      url: stopUrl(cfg.apiBase),
      method: 'POST',
      body: stopBody(channel, resource),
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + access },
      timeout: 15,
    })
    return !!res && res.statusCode >= 200 && res.statusCode < 300
  } catch {
    return false
  }
}

/**
 * Open a channel for one link, replacing whatever it had.
 *
 * The old one is closed first. Skipping that would leave Google pushing to two
 * channels for one calendar, and the older one's token still verifies until it
 * expires, so the notification would be acted on twice.
 *
 * The signed token is good for longer than the channel is asked to live. It is
 * what makes a notification identifiable, but it is not what makes it
 * trustworthy on its own: the id in the notification has to match the id on the
 * row as well, and that is replaced every renewal. Cutting the signature short
 * would only mean a channel Google is still pushing to, whose notifications are
 * ignored for the last hours of its life.
 */
function openChannel(app, cfg, row, nowMs) {
  if (!cfg.watchAddress) return false
  const cal = require(CAL)
  const { signState } = require(STATE)

  let refresh = ''
  try {
    refresh = $security.decrypt(String(row.get('secret')), cfg.secret)
  } catch {
    return false
  }
  const access = mintAccess(cfg, refresh)
  if (!access) return false

  const had = String(row.get('channel') || '')
  const hadResource = String(row.get('resource') || '')
  if (had && hadResource) closeChannel(cfg, access, had, hadResource)

  const channel = $security.randomString(32)
  const ttl = cal.WATCH_TTL_S
  const token = signState(row.get('owner'), nowMs + ttl * 1000 + cal.RENEW_MARGIN_MS, cfg.secret)

  let res = null
  try {
    res = $http.send({
      url: cal.watchUrl(cfg.apiBase),
      method: 'POST',
      body: cal.watchBody(channel, cfg.watchAddress, token, ttl),
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + access },
      timeout: 30,
    })
  } catch {
    return false
  }
  if (!res || res.statusCode < 200 || res.statusCode >= 300) return false
  const payload = res.json || {}
  const resource = String(payload.resourceId || '')
  if (!resource) return false

  try {
    row.set('channel', channel)
    row.set('resource', resource)
    row.set('channel_expires', new Date(cal.channelExpiry(payload, nowMs, ttl)).toISOString())
    app.save(row)
  } catch {
    /* The channel is open at Google and unrecorded here, which the renewal
       cron repairs: a link with no channel id is due. Nothing is lost but one
       notification nobody can attribute, and those are dropped. */
    return false
  }
  return true
}

/** Close the channel a link has, and forget it. Called before a row is deleted. */
function dropChannel(cfg, row) {
  const channel = String(row.get('channel') || '')
  const resource = String(row.get('resource') || '')
  if (!channel || !resource) return
  let refresh = ''
  try {
    refresh = $security.decrypt(String(row.get('secret')), cfg.secret)
  } catch {
    return
  }
  const access = mintAccess(cfg, refresh)
  if (access) closeChannel(cfg, access, channel, resource)
}

/**
 * Every Google link whose channel is missing or nearly gone, renewed.
 *
 * The cron body. Bounded per run so one server with a lot of members does not
 * spend an hour of its own inside a scheduled job; whatever is left is due
 * again on the next tick, and the margin is a day wide for exactly that reason.
 */
function renewAll(app, nowMs, limit) {
  const cal = require(CAL)
  const cfg = cal.envConfig()
  if (!cfg || !cfg.watchAddress) return { skipped: true, renewed: 0, failed: 0 }

  let rows = []
  try {
    rows = app.findRecordsByFilter('calendar_links', 'provider = "google"', '', limit || 200, 0)
  } catch {
    return { skipped: false, renewed: 0, failed: 0 }
  }
  let renewed = 0
  let failed = 0
  for (const row of rows) {
    if (!cal.renewDue(row.get('channel'), row.get('channel_expires'), nowMs)) continue
    if (openChannel(app, cfg, row, nowMs)) renewed += 1
    else failed += 1
  }
  return { skipped: false, renewed: renewed, failed: failed }
}

module.exports = { mintAccess, openChannel, closeChannel, dropChannel, renewAll }
