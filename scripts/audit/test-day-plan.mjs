/**
 * The day planner, through the app.
 *
 * `day-plan.spec.ts` proves the arithmetic exhaustively and cannot see a
 * screen. This walks the three things it has no access to:
 *
 *   the gate      /day refuses an account that has not paid, and opens for one
 *                 that has, without a reload, because the entitlement lands in
 *                 the session store rather than in a page load
 *   the form      an anchor entered by hand survives into the day
 *   the day       the timeline draws the anchor and names the free time around
 *                 it, and the header's free total moves with it
 *   the companion a paragraph becomes proposals, the guesses are labelled as
 *                 guesses, and nothing is saved until it is tapped
 *   the calendar  a real .ics file blocks real time, its titles are shown and
 *                 not stored unless asked, and the day exports back out
 *   the gym bus   an event the member said yes to blocks time; one they have
 *                 not answered does not
 *   the module    intimate activity is off until switched on, takes only what
 *                 is left of a day, and never reaches the calendar file
 *
 * The last one is the whole feature in one assertion. Everything else on that
 * screen comes from somewhere else in the app; what this phase added is the
 * word "when", and this is where somebody can see it.
 *
 *   node scripts/audit/test-day-plan.mjs
 *
 * Needs the PocketBase binary at deploy/pocketbase/.local/pocketbase and a
 * server for the app; point at it with BASE_URL.
 */
import { spawn } from 'node:child_process'
import http from 'node:http'
import net from 'node:net'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import AxeBuilder from '@axe-core/playwright'
import { chromium } from 'playwright'
import { door } from './gate.mjs'
import { startSandbox } from './pb-sandbox.mjs'

const BASE = process.env.BASE_URL ?? 'http://localhost:3015'
const SHOTS = process.env.SHOT_DIR ?? path.join(import.meta.dirname, '../../.audit-shots')

let failures = 0
const check = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failures += 1
  console.log(
    `  ${ok ? 'ok  ' : 'FAIL'}  ${label}` +
      (ok ? '' : `\n          want ${JSON.stringify(want)}\n          got  ${JSON.stringify(got)}`),
  )
}

/**
 * A coach that answers instantly, on loopback.
 *
 * The sandbox gets COACH_* pointed here, so the server reports a coach on our
 * own hardware and the day read has something to talk to. It answers the day
 * prompt with one suggestion per gap it was told about plus one gap it was not,
 * and a dash the house does not use, so the walk can watch the gate drop the
 * invention and clean the text. Anything else (the intake) gets no anchors,
 * which leaves the regex path in charge exactly as a server with no coach would.
 */
const coach = http.createServer((req, res) => {
  let body = ''
  req.on('data', (d) => (body += d))
  req.on('end', () => {
    let content = '{"anchors":[]}'
    try {
      const { messages } = JSON.parse(body)
      const user = messages.find((m) => m.role === 'user')?.content ?? ''
      if (/fixed list of \d+ arrangements/.test(user)) {
        /* Two ids that exist and one that does not, so the walk can see the
           gate drop the invention. */
        content = JSON.stringify({
          picks: [
            { id: 'spooning', why: 'Neither person carries any weight.' },
            { id: 'the-wheelbarrow', why: 'Invented, and must not reach a screen.' },
            { id: 'seated-one-behind', why: 'Almost nothing moves.' },
          ],
        })
      } else if (/what it allows/.test(user)) {
        const gaps = [...user.matchAll(/^- (\d\d:\d\d) to (\d\d:\d\d) \(/gm)].map((m) => ({ start: m[1], end: m[2] }))
        content = JSON.stringify({
          read: 'Work takes the middle — the edges are yours.',
          gaps: [
            ...gaps.map((g) => ({ ...g, suggestion: `Something for ${g.start}` })),
            { start: '03:00', end: '04:00', suggestion: 'Invented at three in the morning' },
          ],
        })
      }
    } catch {
      /* The default answer. */
    }
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({
      model: 'fake',
      usage: { prompt_tokens: 1, completion_tokens: 1 },
      choices: [{ message: { role: 'assistant', content } }],
    }))
  })
})
await new Promise((r) => coach.listen(0, '127.0.0.1', r))
/**
 * Ticketmaster, on loopback: three events, one of them today at eight, one with
 * a day and no hour, one whose ticket link is not https. What the route asked
 * for is recorded, so the walk can see that a cell went and a coordinate did
 * not.
 */
const tm = { hits: 0, lastUrl: '' }
const ymd = (offsetDays) => {
  const at = new Date()
  at.setDate(at.getDate() + offsetDays)
  return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`
}
const ticketmaster = http.createServer((req, res) => {
  tm.hits += 1
  tm.lastUrl = req.url
  res.writeHead(200, { 'content-type': 'application/json' })
  res.end(JSON.stringify({ _embedded: { events: [
    { id: 'tm-1', name: 'Fake Quartet', url: 'https://tickets.example/quartet',
      dates: { start: { localDate: ymd(0), localTime: '20:00:00' } },
      classifications: [{ segment: { name: 'Music' } }],
      _embedded: { venues: [{ name: 'The Old Hall', city: { name: 'Barcelona' } }] } },
    { id: 'tm-2', name: 'All-day fair', url: 'https://tickets.example/fair',
      dates: { start: { localDate: ymd(1) } },
      classifications: [{ segment: { name: 'Miscellaneous' } }],
      _embedded: { venues: [{ name: 'The park' }] } },
    { id: 'tm-3', name: 'Away match', url: 'http://insecure.example/match',
      dates: { start: { localDate: ymd(3), localTime: '18:30:00' } },
      classifications: [{ segment: { name: 'Sports' } }],
      _embedded: { venues: [{ name: 'The ground', city: { name: 'Barcelona' } }] } },
  ] } }))
})
await new Promise((r) => ticketmaster.listen(0, '127.0.0.1', r))

/**
 * Google, on loopback: the consent screen, the token endpoint, the calendar and
 * the revoke, all of it fake and all of it in the shape the real one answers in.
 *
 * The consent screen redirects straight back rather than asking anything, which
 * is the one thing a walk cannot drive. Everything after that is the real code
 * path: the signed state, the code exchange, the refresh token sealed into a
 * collection nothing can read, a fresh access token per pull, and the events
 * normalised into busy blocks.
 *
 * The calendar answers with four events chosen to be argued about: one at seven
 * this evening that should reach the day, one this person declined, one all-day
 * birthday, and one the calendar itself marks free. Only the first blocks time.
 */
const google = {
  tokenCalls: 0,
  eventCalls: 0,
  revoked: false,
  lastAuthUrl: '',
  /* Set by the walk to make the next refresh fail the way a grant somebody
     took away in their Google account fails: `invalid_grant`, 400. Cleared
     again by a fresh code exchange, because that is what reconnecting is. */
  grantWithdrawn: false,
}
/* RS256 in the header and a nonsense signature: the callback parses this
   without verifying it, and a parser that is handed `alg: none` is entitled to
   refuse it outright. What Google sends is RS256, so that is what the fake
   sends. */
const jwt = (claims) => {
  const part = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
  return `${part({ alg: 'RS256', typ: 'JWT', kid: 'fake' })}.${part(claims)}.${Buffer.from('not-a-real-signature').toString('base64url')}`
}
const googleServer = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1')
  if (url.pathname === '/o/oauth2/v2/auth') {
    google.lastAuthUrl = req.url
    const back = new URL(url.searchParams.get('redirect_uri'))
    back.searchParams.set('code', 'fake-auth-code')
    back.searchParams.set('state', url.searchParams.get('state') ?? '')
    res.writeHead(302, { location: back.toString() })
    res.end()
    return
  }
  if (url.pathname === '/token') {
    google.tokenCalls += 1
    let body = ''
    req.on('data', (d) => (body += d))
    req.on('end', () => {
      const refreshing = /grant_type=refresh_token/.test(body)
      if (refreshing && google.grantWithdrawn) {
        res.writeHead(400, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: 'invalid_grant', error_description: 'Token has been expired or revoked.' }))
        return
      }
      if (!refreshing) google.grantWithdrawn = false
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({
        access_token: 'fake-access-token',
        expires_in: 3599,
        ...(refreshing
          ? {}
          : {
              refresh_token: 'fake-refresh-token',
              id_token: jwt({ email: 'diary@enforma.test', exp: 4102444800 }),
            }),
      }))
    })
    return
  }
  if (url.pathname === '/revoke') {
    google.revoked = true
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end('{}')
    return
  }
  if (url.pathname.startsWith('/calendar/v3/')) {
    google.eventCalls += 1
    const at = new Date()
    const day = `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`
    /* The offset this machine is actually in, so "19:00 local" is 19:00 on the
       day the app draws rather than an hour adrift in CI. */
    const mins = -at.getTimezoneOffset()
    const sign = mins < 0 ? '-' : '+'
    const off = `${sign}${String(Math.floor(Math.abs(mins) / 60)).padStart(2, '0')}:${String(Math.abs(mins) % 60).padStart(2, '0')}`
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ items: [
      { summary: 'Dentist, from the diary', status: 'confirmed',
        start: { dateTime: `${day}T19:00:00${off}` }, end: { dateTime: `${day}T20:00:00${off}` } },
      { summary: 'A meeting I said no to', status: 'confirmed',
        attendees: [{ self: true, responseStatus: 'declined' }],
        start: { dateTime: `${day}T11:00:00${off}` }, end: { dateTime: `${day}T12:00:00${off}` } },
      { summary: "Someone's birthday", status: 'confirmed',
        start: { date: day }, end: { date: day } },
      { summary: 'Out of office, but free', status: 'confirmed', transparency: 'transparent',
        start: { dateTime: `${day}T14:00:00${off}` }, end: { dateTime: `${day}T15:00:00${off}` } },
    ] }))
    return
  }
  res.writeHead(404)
  res.end()
})
await new Promise((r) => googleServer.listen(0, '127.0.0.1', r))

/**
 * iCloud, on loopback: CalDAV with the two-step discovery and one REPORT.
 *
 * The password it accepts is the app-specific shape, and anything else gets a
 * 401, which is the case worth walking: somebody typing their Apple ID password
 * has to be told, not stored. The listing includes the collections nobody wants
 * (the home itself, a reminders list, a scheduling inbox) so the filter is
 * exercised rather than assumed, and the events include a recurrence, an
 * all-day birthday and an hour the calendar marks free.
 */
const icloud = { calls: [], reports: 0, lastAuth: '' }
const APP_PASSWORD = 'abcd-efgh-ijkl-mnop'
const icloudServer = http.createServer((req, res) => {
  let body = ''
  req.on('data', (d) => (body += d))
  req.on('end', () => {
    icloud.calls.push(req.method + ' ' + req.url)
    icloud.lastAuth = req.headers.authorization ?? ''
    const expected = 'Basic ' + Buffer.from(`diary@icloud.test:${APP_PASSWORD}`).toString('base64')
    if (icloud.lastAuth !== expected) {
      res.writeHead(401, { 'www-authenticate': 'Basic realm="iCloud"' })
      res.end()
      return
    }
    const xml = (inner) => {
      res.writeHead(207, { 'content-type': 'application/xml; charset=utf-8' })
      res.end('<?xml version="1.0" encoding="UTF-8"?><multistatus xmlns="DAV:" xmlns:cal="urn:ietf:params:xml:ns:caldav">' + inner + '</multistatus>')
    }
    if (req.method === 'PROPFIND' && req.url === '/') {
      xml('<response><href>/</href><propstat><prop><current-user-principal><href>/9876/principal/</href></current-user-principal></prop></propstat></response>')
      return
    }
    if (req.method === 'PROPFIND' && req.url === '/9876/principal/') {
      xml('<response><href>/9876/principal/</href><propstat><prop><cal:calendar-home-set><href>/9876/calendars/</href></cal:calendar-home-set></prop></propstat></response>')
      return
    }
    if (req.method === 'PROPFIND' && req.url === '/9876/calendars/') {
      const one = (href, name, comps, kind) =>
        `<response><href>${href}</href><propstat><prop>` +
        `<resourcetype><collection/>${kind}</resourcetype><displayname>${name}</displayname>` +
        (comps ? `<cal:supported-calendar-component-set>${comps}</cal:supported-calendar-component-set>` : '') +
        '</prop></propstat></response>'
      xml(
        one('/9876/calendars/', '', '', '') +
        one('/9876/calendars/home/', 'Home', '<cal:comp name="VEVENT"/>', '<cal:calendar/>') +
        one('/9876/calendars/tasks/', 'Reminders', '<cal:comp name="VTODO"/>', '<cal:calendar/>') +
        one('/9876/calendars/inbox/', 'Inbox', '', '<cal:schedule-inbox/>'),
      )
      return
    }
    if (req.method === 'REPORT') {
      icloud.reports += 1
      const at = new Date()
      const day = (n) => {
        const d = new Date(at)
        d.setDate(d.getDate() + n)
        return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
      }
      const zone = 'Europe/Madrid'
      const ics = [
        'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Apple Inc.//iOS 18//EN',
        'BEGIN:VEVENT', 'UID:a1', 'SUMMARY:Fisioterapeuta',
        `DTSTART;TZID=${zone}:${day(0)}T160000`, `DTEND;TZID=${zone}:${day(0)}T170000`, 'END:VEVENT',
        'BEGIN:VEVENT', 'UID:a2', 'SUMMARY:Cumpleanos de alguien',
        `DTSTART;VALUE=DATE:${day(1)}`, `DTEND;VALUE=DATE:${day(2)}`, 'END:VEVENT',
        'BEGIN:VEVENT', 'UID:a3', 'SUMMARY:Fuera de la oficina', 'TRANSP:TRANSPARENT',
        `DTSTART;TZID=${zone}:${day(0)}T100000`, `DTEND;TZID=${zone}:${day(0)}T110000`, 'END:VEVENT',
        'END:VCALENDAR',
      ].join('\r\n')
      res.writeHead(207, { 'content-type': 'application/xml; charset=utf-8' })
      res.end('<?xml version="1.0"?><multistatus xmlns="DAV:" xmlns:cal="urn:ietf:params:xml:ns:caldav">' +
        `<response><href>/9876/calendars/home/a.ics</href><propstat><prop><cal:calendar-data>${ics.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</cal:calendar-data></prop></propstat></response>` +
        '</multistatus>')
      return
    }
    res.writeHead(404)
    res.end()
  })
})
await new Promise((r) => icloudServer.listen(0, '127.0.0.1', r))

/**
 * Microsoft, on loopback: the consent screen, the token endpoint and one
 * calendarView.
 *
 * Two things here exist to be argued about. The refresh token **rotates** on
 * every exchange, the way Microsoft's does and Google's does not, and the fake
 * refuses a stale one — so a connection that failed to store the new token
 * would read once and then report itself withdrawn. And the events come back in
 * whatever zone the `Prefer` header asked for, with the header recorded, so the
 * walk can see that the device's zone travelled and the hours are local.
 */
const microsoft = { tokens: 0, views: 0, lastPrefer: '', refresh: 'ms-refresh-0', rotations: 0 }
const microsoftServer = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1')
  let body = ''
  req.on('data', (d) => (body += d))
  req.on('end', () => {
    if (url.pathname === '/oauth2/v2.0/authorize') {
      const back = new URL(url.searchParams.get('redirect_uri'))
      back.searchParams.set('code', 'ms-code')
      back.searchParams.set('state', url.searchParams.get('state') ?? '')
      res.writeHead(302, { location: back.toString() })
      res.end()
      return
    }
    if (url.pathname === '/oauth2/v2.0/token') {
      microsoft.tokens += 1
      const refreshing = /grant_type=refresh_token/.test(body)
      if (refreshing) {
        const sent = decodeURIComponent((/refresh_token=([^&]*)/.exec(body) ?? [])[1] ?? '')
        if (sent !== microsoft.refresh) {
          /* A stale refresh token is exactly what Microsoft refuses. */
          res.writeHead(400, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ error: 'invalid_grant' }))
          return
        }
        microsoft.rotations += 1
      }
      microsoft.refresh = `ms-refresh-${microsoft.rotations + 1}`
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({
        access_token: 'ms-access',
        expires_in: 3599,
        refresh_token: microsoft.refresh,
        ...(refreshing ? {} : { id_token: jwt({ preferred_username: 'diary@outlook.test', exp: 4102444800 }) }),
      }))
      return
    }
    if (url.pathname === '/me/calendarView') {
      microsoft.views += 1
      microsoft.lastPrefer = req.headers.prefer ?? ''
      const at = new Date()
      const day = (n) => {
        const d = new Date(at)
        d.setDate(d.getDate() + n)
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      }
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ value: [
        { subject: 'Sprint review', isAllDay: false, isCancelled: false, showAs: 'busy',
          start: { dateTime: `${day(0)}T14:00:00.0000000`, timeZone: 'Europe/Madrid' },
          end: { dateTime: `${day(0)}T15:00:00.0000000`, timeZone: 'Europe/Madrid' } },
        { subject: 'A day off', isAllDay: true, isCancelled: false, showAs: 'free',
          start: { dateTime: `${day(1)}T00:00:00.0000000` },
          end: { dateTime: `${day(2)}T00:00:00.0000000` } },
        { subject: 'One I declined', isAllDay: false, isCancelled: false, showAs: 'busy',
          responseStatus: { response: 'declined' },
          start: { dateTime: `${day(0)}T12:00:00.0000000` },
          end: { dateTime: `${day(0)}T13:00:00.0000000` } },
      ] }))
      return
    }
    res.writeHead(404)
    res.end()
  })
})
await new Promise((r) => microsoftServer.listen(0, '127.0.0.1', r))

/* The redirect URI has to name the sandbox, and the sandbox has to be told the
   redirect URI, so the port is chosen before either exists. */
const pbPort = await new Promise((resolve) => {
  const probe = net.createServer()
  probe.listen(0, '127.0.0.1', () => {
    const { port } = probe.address()
    probe.close(() => resolve(port))
  })
})
const googleBase = `http://127.0.0.1:${googleServer.address().port}`
const pb = await startSandbox({
  port: pbPort,
  env: {
    COACH_API_KEY: 'fake',
    COACH_BASE_URL: `http://127.0.0.1:${coach.address().port}`,
    TICKETMASTER_API_KEY: 'fake',
    TICKETMASTER_BASE_URL: `http://127.0.0.1:${ticketmaster.address().port}`,
    GOOGLE_CLIENT_ID: 'fake.apps.googleusercontent.com',
    GOOGLE_CLIENT_SECRET: 'fake-client-secret',
    GOOGLE_REDIRECT_URI: `http://127.0.0.1:${pbPort}/api/enforma/calendar/google/callback`,
    GOOGLE_AUTH_BASE_URL: googleBase,
    GOOGLE_TOKEN_BASE_URL: googleBase,
    GOOGLE_API_BASE_URL: googleBase,
    APP_BASE_URL: BASE,
    CALENDAR_SECRET: 'walk-calendar-secret-32-chars-ok!'.slice(0, 32),
    CALDAV_BASE_URL: `http://127.0.0.1:${icloudServer.address().port}`,
    MICROSOFT_CLIENT_ID: 'fake-microsoft-client',
    MICROSOFT_CLIENT_SECRET: 'fake-microsoft-secret',
    MICROSOFT_REDIRECT_URI: `http://127.0.0.1:${pbPort}/api/enforma/calendar/microsoft/callback`,
    MICROSOFT_AUTH_BASE_URL: `http://127.0.0.1:${microsoftServer.address().port}`,
    MICROSOFT_API_BASE_URL: `http://127.0.0.1:${microsoftServer.address().port}`,
  },
})
const browser = await chromium.launch()

const grantPro = (args) =>
  new Promise((resolve) => {
    const p = spawn('node', ['scripts/admin/grant-pro.mjs', '--server', pb.base, ...args], {
      env: { ...process.env, PB_SUPERUSER_EMAIL: 'probe@enforma.test', PB_SUPERUSER_PASSWORD: 'Sup3rSecret123' },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let out = ''
    p.stdout.on('data', (d) => (out += d))
    p.stderr.on('data', (d) => (out += d))
    p.on('exit', (code) => resolve({ code, out: out.trim() }))
  })

try {
  /* A position in Barcelona, granted: the strip rounds it to a cell before it
     leaves, and the fake vendor's log is where that is checked. */
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 1000 },
    geolocation: { latitude: 41.3874, longitude: 2.1686 },
    permissions: ['geolocation'],
  })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  const { create } = door(page, BASE)

  const main = () => page.locator('main')
  const dayText = async () => (await main().innerText()).replace(/\s+/g, ' ').trim()
  /**
   * Everything that shapes the day lives in a sheet at `?edit`, portaled out
   * of <main>, so `dayText` never sees it and `sheetText` sees only it. That
   * separation is the redesign: the screen is the day, the forms are a drawer.
   */
  const sheet = () => page.getByRole('dialog')
  const sheetText = async () => (await sheet().innerText()).replace(/\s+/g, ' ').trim()
  const openSheet = async () => {
    if ((await sheet().count()) > 0 && (await sheet().isVisible())) return
    await page.getByRole('button', { name: /Shape my day/ }).click()
    await sheet().waitFor({ timeout: 8000 })
    /* Let it finish sliding in. axe measures contrast through a half-faded
       sheet otherwise, and a click during the slide lands beside its target. */
    await page.waitForFunction(() => {
      const d = document.querySelector('[role="dialog"]')
      return d !== null && d.getAnimations({ subtree: true }).every((a) => a.playState === 'finished')
    }, undefined, { timeout: 8000 })
  }
  const closeSheet = async () => {
    if ((await sheet().count()) === 0) return
    await page.keyboard.press('Escape')
    await sheet().waitFor({ state: 'hidden', timeout: 8000 }).catch(() => {})
    await page.waitForTimeout(250)
  }

  console.log('\nbefore anybody has paid')
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await create('Planner', 'planner-pass')
  await page.goto(`${BASE}/day`, { waitUntil: 'networkidle' })
  const refused = await dayText()
  check('the day is refused', /Part of Pro/.test(refused), true)
  check('and it does not draw a day behind the notice', /Hours you do not choose/.test(refused), false)
  check('it points at where the account state lives', /Open Settings/.test(refused), true)

  console.log('\nan account that has')
  await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle' })
  await page.getByRole('tab', { name: /^Data/ }).click()
  await page.getByRole('button', { name: 'Create sync account' }).click()
  await page.getByLabel('Email').fill('planner@day.test')
  await page.getByLabel('Password', { exact: true }).fill('planner-account-1')
  await page.getByLabel('Repeat password').fill('planner-account-1')
  await page.getByRole('button', { name: 'Advanced' }).click()
  await page.getByLabel('Server').fill(pb.base)
  await page.getByRole('button', { name: /Create and upload|Creating/ }).click()
  await page.waitForTimeout(2500)
  check('the account exists', (await pb.userByEmail('planner@day.test')) !== null, true)
  /* The recovery code is shown exactly once and its dialog sits over the page
     until it is acknowledged, so nothing behind it is clickable. Dismissing it
     is what a person does here too. */
  await page.getByRole('button', { name: 'I wrote it down' }).click()
  await page.waitForTimeout(300)

  check('the grant script exits clean', (await grantPro(['--account', 'planner@day.test', '--months', '1'])).code, 0)
  /**
   * Checked from the panel rather than by reloading, on purpose. The
   * entitlement is published into the session store, so the nav item and the
   * gate have to change without a page load; a reload here would pass whether
   * or not that worked.
   */
  const panel = page.getByRole('region', { name: 'Subscription' })
  await panel.getByRole('button', { name: /Check again|Checking/ }).click()
  await page.waitForTimeout(1500)
  check('the panel says Pro', /Paid up to/.test(await panel.innerText()), true)
  check(
    'and the rail grew a way in, with no reload',
    await page.getByRole('link', { name: 'Your day' }).count(),
    1,
  )

  console.log('\nan empty day')
  await page.getByRole('link', { name: 'Your day' }).click()
  /* The route is lazy, so the URL matches before anything is rendered.
     Waiting on the heading is waiting for the screen. */
  await page.getByRole('heading', { name: 'Your day', level: 1 }).waitFor({ timeout: 10000 })
  const empty = await dayText()
  check('opens now', /Your day/.test(empty), true)
  check('with sixteen hours of nothing', /16h free/.test(empty), true)
  check('and says what it wants', /Nothing on it yet/.test(empty), true)
  check('with the hour ruler already drawn', /07:00/.test(empty) && /22:00/.test(empty), true)

  console.log('\nan hour somebody does not choose')
  await openSheet()
  await sheet().getByRole('button', { name: 'Add fixed hours' }).click()
  await sheet().getByLabel('What is it').fill('work')
  await sheet().getByLabel('Starts').fill('09:00')
  await sheet().getByLabel('Ends').fill('17:00')
  await sheet().getByRole('button', { name: 'Add it' }).click()
  await page.waitForTimeout(500)
  await closeSheet()
  const withWork = await dayText()
  check('is on the day', /work/.test(withWork), true)
  check('at the hours it was given', /09:00 to 17:00/.test(withWork), true)

  console.log('\nand the day around it')
  /* This is the feature: the free time either side, named, with no activity
     invented to fill it. Default window is 07:00 to 23:00. */
  check('two hours before it', /2h free/.test(withWork), true)
  check('six hours after it', /6h free/.test(withWork), true)
  check('and the total moved with it', /8h free/.test(withWork), true)
  check('nothing was invented to fill the gaps', /Rest|Free time|Downtime/.test(withWork), false)

  /* One picture of the thing this phase built, for whoever reads the run. */
  await mkdir(SHOTS, { recursive: true })
  await page.screenshot({ path: path.join(SHOTS, 'day-plan.png'), fullPage: false })

  console.log('\nthe screen behind the gate, for axe')
  /**
   * `a11y-sweep.mjs` reaches `/day` with no account, so what it sweeps there is
   * the Pro notice. The planner itself only exists for a paid account, which is
   * what this walk already has open, so the sweep of the real screen belongs
   * here rather than in a second harness that would have to pay for one.
   */
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  const serious = violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id} (${v.nodes.length}) ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`)
  check('no serious or critical violations', serious, [])
  await openSheet()
  /* Scoped to the sheet: what is behind the backdrop is dimmed on purpose. */
  const { violations: sheetViolations } = await new AxeBuilder({ page })
    .include('[role="dialog"]')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  check(
    'and none with the sheet open',
    sheetViolations
      .filter((v) => v.impact === 'serious' || v.impact === 'critical')
      .map((v) => `${v.id} (${v.nodes.length}) ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`),
    [],
  )

  console.log('\nthe day, read')
  /* The sheet is still open from the axe pass above and its backdrop takes
     every click meant for the page behind it. */
  await closeSheet()
  const beforeRead = await dayText()
  check('is offered, and says where the day goes', /Read by a model running on our own hardware/.test(beforeRead), true)
  check('and nothing was read before anybody asked', /the edges are yours/.test(beforeRead), false)
  await main().getByRole('button', { name: 'Read my day' }).click()
  /* Whichever sentence the panel settles on. Waiting for the good one alone
     turned a wrong answer into a timeout with nothing to read. */
  const OUTCOME = /the edges are yours|could not be reached|did not fit the day|answered enough times|No coach on this server/
  await main().getByText(OUTCOME).first().waitFor({ timeout: 15000 }).catch(() => {})
  const withRead = await dayText()
  const panelText = (await main().locator('section[aria-labelledby="day-read-title"]').innerText()).replace(/\s+/g, ' ').trim()
  check(
    'two sentences about the day, with the dash the house does not use gone',
    /Work takes the middle , the edges are yours\./.test(withRead) ? 'the edges are yours, comma and all' : `panel says: ${panelText}`,
    'the edges are yours, comma and all',
  )
  check('a suggestion sits in the morning gap', /Something for 07:00/.test(withRead), true)
  check('and the gap it invented at three in the morning does not', /Invented at three/.test(withRead), false)
  const spent = async () =>
    (await pb.api('GET', '/api/collections/coach_usage/records?perPage=1', undefined, pb.su)).json.totalItems
  check('the meter counted one call', await spent(), 1)
  await page.reload({ waitUntil: 'networkidle' })
  await main().getByText(/the edges are yours/).waitFor({ timeout: 15000 })
  check('a reload keeps the reading without asking again', await spent(), 1)
  const { violations: readViolations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  check(
    'and the reading passes axe',
    readViolations
      .filter((v) => v.impact === 'serious' || v.impact === 'critical')
      .map((v) => `${v.id} (${v.nodes.length}) ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`),
    [],
  )
  /* The next section works inside the sheet. */
  await openSheet()

  console.log('\nwhat the form refuses')
  await sheet().getByRole('button', { name: 'Add more fixed hours' }).click()
  await sheet().getByLabel('What is it').fill('night shift')
  await sheet().getByLabel('Starts').fill('22:00')
  await sheet().getByLabel('Ends').fill('06:00')
  await sheet().getByRole('button', { name: 'Add it' }).click()
  await page.waitForTimeout(300)
  const refusedAnchor = await sheetText()
  check('an entry that ends before it starts is refused', /two entries/.test(refusedAnchor), true)
  /* Counting the rows rather than searching the text: the rejected label is
     still sitting in the form's own input, and an input's value is not part of
     innerText, so a text search would have "proved" it was not saved either
     way. One remove button per saved anchor is the fact worth asserting. */
  check('and nothing was added', await sheet().getByRole('button', { name: /^Remove / }).count(), 1)
  await sheet().getByRole('button', { name: 'Cancel' }).click()
  await page.waitForTimeout(300)
  check('cancelling leaves the one good anchor', await sheet().getByRole('button', { name: /^Remove / }).count(), 1)
  await closeSheet()

  console.log('\nToday, while the day has something on it')
  await page.goto(BASE, { waitUntil: 'networkidle' })
  const today = await dayText()
  check('carries one line into the day', /No session today/.test(today), true)
  check('with the free total on it', /8h free/.test(today), true)

  console.log('\nthe companion')
  await page.goto(`${BASE}/day/intake`, { waitUntil: 'networkidle' })
  await page.getByRole('heading', { name: 'Describe your week', level: 1 }).waitFor({ timeout: 10000 })
  const intake = await dayText()
  /* No coach is configured against a sandbox, so the sentence has to be the
     one that promises nothing leaves. The point of `where()` living in one
     place is that this sentence and the request cannot disagree. */
  /* The sandbox's coach is the fake one on loopback, which the server classifies
     as our own hardware, and the sentence has to say that rather than promise
     the words stayed on the device. */
  check('says where the words go, before the box is used', /model running on our own hardware/.test(intake), true)
  check('and nothing is proposed before it is asked', /What it read/.test(intake), false)

  await page.getByLabel('Describe your week').fill(
    'I work 09:00 to 17:00, the school run is at 08:15, and I get the train home 17:30 to 18:15',
  )
  await page.getByRole('button', { name: /Read it|Reading/ }).click()
  await page.waitForTimeout(1200)
  const readOut = await dayText()
  check('reads the three things out of one paragraph', /What it read/.test(readOut), true)
  check('read on this device, with no coach behind it', /read on this device/.test(readOut), true)
  /* The labels, not just the presence of a row. "school run is" and "get train
     home" both shipped once and read badly on a screen somebody opens every
     morning. */
  check('names the school run cleanly', /school run\b/.test(readOut), true)
  check('and the train, without the verb that got to it', /train home/.test(readOut), true)
  check('with no copula left on the end', /school run is/.test(readOut), false)
  /* The work hours are already on the profile from the form above, so that
     proposal is filtered rather than offered twice. */
  check('does not offer back an hour already on the day', await page.getByRole('button', { name: 'Keep' }).count(), 2)
  check('labels what it worked out rather than quoted', /Worked out/.test(readOut), true)
  check('and says nothing is saved until it is kept', /Nothing here is saved until you keep it/.test(readOut), true)
  await page.screenshot({ path: path.join(SHOTS, 'day-intake.png'), fullPage: false })

  console.log('\nkeeping one of them')
  await page.getByRole('button', { name: 'Keep' }).first().click()
  await page.waitForTimeout(400)
  check('one fewer to decide about', await page.getByRole('button', { name: 'Keep' }).count(), 1)
  check('and it says so', /1 hour kept/.test(await dayText()), true)

  console.log('\ndiscarding the other')
  await page.getByRole('button', { name: /^Discard / }).first().click()
  await page.waitForTimeout(400)
  check('nothing left to decide', await page.getByRole('button', { name: 'Keep' }).count(), 0)

  console.log('\nwhat reached the day')
  await page.goto(`${BASE}/day`, { waitUntil: 'networkidle' })
  await page.getByRole('heading', { name: 'Your day', level: 1 }).waitFor({ timeout: 10000 })
  const afterIntake = await dayText()
  check('the kept hour is on it', /school run/.test(afterIntake), true)
  check('the discarded one is not', /train home/.test(afterIntake), false)
  await openSheet()
  check('two anchors now', await sheet().getByRole('button', { name: /^Remove / }).count(), 2)
  check('and the reading is gone, because the day changed', /the edges are yours/.test(await dayText()), false)

  console.log('\nan hour they would rather train')
  /* Work 09:00-17:00 leaves 07:00-08:15 (the school run now takes 08:15),
     and 17:00-23:00. Without a preference a 90 minute session takes the
     evening; asked for the morning it cannot fit, so it stays in the evening. */
  await sheet().getByLabel('Train around').fill('20:00')
  await page.waitForTimeout(400)
  check('the preference is held', await sheet().getByLabel('Train around').inputValue(), '20:00')

  console.log('\na calendar file')
  /* Dates relative to today, because the parser windows on today and a fixture
     with fixed dates would start passing for the wrong reason and then stop. */
  const inDays = (n) => {
    const at = new Date()
    at.setDate(at.getDate() + n)
    return `${at.getFullYear()}${String(at.getMonth() + 1).padStart(2, '0')}${String(at.getDate()).padStart(2, '0')}`
  }
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Google Inc//Google Calendar 70.9054//EN',
    'BEGIN:VEVENT',
    `DTSTART;TZID=Europe/Madrid:${inDays(0)}T190000`,
    `DTEND;TZID=Europe/Madrid:${inDays(0)}T210000`,
    'SUMMARY:Dentist, the long appointment',
    'TRANSP:OPAQUE',
    'END:VEVENT',
    'BEGIN:VEVENT',
    `DTSTART;VALUE=DATE:${inDays(1)}`,
    `DTEND;VALUE=DATE:${inDays(2)}`,
    'SUMMARY:Somebody birthday',
    'END:VEVENT',
    'BEGIN:VEVENT',
    `DTSTART:${inDays(3)}T100000`,
    `DTEND:${inDays(3)}T110000`,
    'SUMMARY:Focus block',
    'TRANSP:TRANSPARENT',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n')
  const dir = await mkdtemp(path.join(tmpdir(), 'enforma-ics-'))
  const file = path.join(dir, 'calendar.ics')
  await writeFile(file, ics, 'utf8')

  await openSheet()
  await page.setInputFiles('#ics-file', file)
  await page.waitForTimeout(600)
  const preview = await sheetText()
  check('the timed event is offered', /Dentist, the long appointment/.test(preview), true)
  check('the all-day one is not', /birthday/i.test(preview), false)
  check('nor the one the calendar calls free', /Focus block/.test(preview), false)
  check('one event, not three', /1 event found/.test(preview), true)
  check('and the titles are off by default', /Titles are shown here and not saved/.test(preview), true)

  await sheet().getByRole('button', { name: 'Add the ticked ones' }).click()
  await page.waitForTimeout(600)
  check('it went on the day', /1 block added/.test(await sheetText()), true)
  await closeSheet()
  const withBlock = await dayText()
  check('as Busy, with no title stored', /Busy/.test(withBlock), true)
  check('and the title did not follow it', /Dentist/.test(withBlock), false)
  /* 16h awake, less 8h of work, half an hour of school run and the two hours
     the dentist takes. */
  check('the free total dropped by what it takes', /5h 30m free/.test(withBlock), true)
  await page.screenshot({ path: path.join(SHOTS, 'day-calendar.png'), fullPage: false })

  console.log('\nthe same file again')
  await openSheet()
  await page.setInputFiles('#ics-file', file)
  await page.waitForTimeout(600)
  await sheet().getByRole('button', { name: 'Add the ticked ones' }).click()
  await page.waitForTimeout(600)
  /* Importing twice is what somebody does when they are not sure it worked. */
  check('adds nothing', /Nothing new/.test(await sheetText()), true)

  console.log('\nkeeping the titles, when asked')
  await sheet().getByRole('button', { name: /^Forget \d+ imported/ }).click()
  await page.waitForTimeout(400)
  await page.setInputFiles('#ics-file', file)
  await page.waitForTimeout(600)
  await sheet().getByRole('switch', { name: 'Keep the titles' }).click()
  await sheet().getByRole('button', { name: 'Add the ticked ones' }).click()
  await page.waitForTimeout(600)
  await closeSheet()
  check('the title is on the day now', /Dentist, the long appointment/.test(await dayText()), true)

  console.log('\nexporting the day')
  await openSheet()
  const download = page.waitForEvent('download', { timeout: 10000 })
  await sheet().getByRole('button', { name: /Send today to my calendar/ }).click()
  const saved = await download
  check('a file comes back', saved.suggestedFilename().endsWith('.ics'), true)

  console.log('\nforgetting what was imported')
  await sheet().getByRole('button', { name: /^Forget \d+ imported/ }).click()
  await page.waitForTimeout(500)
  await closeSheet()
  const cleared = await dayText()
  check('the block is gone', /Dentist/.test(cleared), false)
  check('and the anchors are not', /school run/.test(cleared), true)

  console.log('\na calendar somebody connected')
  await openSheet()
  const beforeConnect = await sheetText()
  check('says what the server will hold, before anything is connected',
    /a key that can read your calendar until you disconnect it/.test(beforeConnect), true)
  check('and that it may only read', /it may only read, it never writes/.test(beforeConnect), true)
  await sheet().getByRole('button', { name: 'Connect Google Calendar' }).click()
  /* Out to the consent screen, back through the callback, and into the day.
     Reported rather than thrown: a connection that stops halfway should name
     where it stopped, not time out with an empty log. */
  const landed = await page
    .waitForURL(/\/day\?calendar=connected/, { timeout: 20000 })
    .then(() => 'connected')
    .catch(async () => `stopped at ${page.url()} saying: ${(await sheetText().catch(() => '')).slice(0, 240)}`)
  check('the consent screen sends them back connected', landed, 'connected')
  await sheet().waitFor({ timeout: 10000 })
  /* Connected is "Read it again exists": the panel only offers to re-read a
     calendar it believes is attached. Reported with what the panel actually
     says, so a connection that half-landed names itself. */
  const settled = await sheet()
    .getByRole('button', { name: 'Read it again' })
    .waitFor({ timeout: 15000 })
    .then(() => 'connected')
    .catch(async () => `panel says: ${(await sheetText()).replace(/^.*Your calendar/s, '').slice(0, 260)}`)
  check('and the panel says the calendar is attached', settled, 'connected')
  check('the account it belongs to is shown back', /diary@enforma\.test/.test(await sheetText()), true)
  check('the scope asked for was read-only',
    /calendar\.events\.readonly/.test(google.lastAuthUrl) && !/calendar\.events&/.test(google.lastAuthUrl), true)
  check('and offline, so it can be read again tomorrow',
    /access_type=offline/.test(google.lastAuthUrl), true)
  check('the diary was read once', google.eventCalls, 1)
  await closeSheet()
  const withDiary = await dayText()
  check('the evening appointment is on the day', /19:00 to 20:00/.test(withDiary), true)
  check('with no title, because titles are off by default',
    /Dentist, from the diary/.test(withDiary), false)
  check('the birthday is not', /birthday/i.test(withDiary), false)
  check('nor the one they declined', /said no to/.test(withDiary), false)
  check('nor the hour the calendar itself calls free', /Out of office/.test(withDiary), false)

  console.log('\nasking for the titles')
  await openSheet()
  await sheet().getByRole('switch', { name: 'Keep the titles' }).click()
  await sheet().getByRole('button', { name: 'Read it again' }).click()
  await page.waitForTimeout(1500)
  check('a second read costs a second token', google.tokenCalls >= 3, true)
  await closeSheet()
  check('and the title is on the day now', /Dentist, from the diary/.test(await dayText()), true)

  console.log('\nwhat the connection never hands back')
  /* The account's own token, taken from where the app keeps it, so the next
     three questions are asked as the member rather than as a superuser. */
  const memberToken = await page.evaluate(() => {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i)
      if (!key || !key.startsWith('forma-sync-')) continue
      try {
        const parsed = JSON.parse(localStorage.getItem(key))
        if (parsed && typeof parsed.token === 'string' && parsed.token) return parsed.token
      } catch {
        /* Not a link. */
      }
    }
    return null
  })
  check('the walk is holding the account it is asking as', typeof memberToken, 'string')
  const linkRow = await pb.api('GET', '/api/collections/calendar_links/records', undefined, memberToken)
  check('a member cannot list the collection holding it', linkRow.status >= 400, true)
  const stored = await pb.api('GET', '/api/collections/calendar_links/records', undefined, pb.su)
  check('the superuser sees one row', stored.json.totalItems, 1)
  check('and what it holds is not the token Google sent',
    stored.json.items[0].secret !== 'fake-refresh-token' && stored.json.items[0].secret.length > 0, true)
  const status = await pb.api('GET', '/api/enforma/calendar/status', undefined, memberToken)
  check('status names the account and no secret',
    JSON.stringify(status.json).includes('fake-refresh-token'), false)

  console.log('\na grant somebody took away')
  /* Revoked in their Google account rather than here, which is the case no
     walk covered: the row is still ours, the refresh token is not, and the
     screen has to say which. */
  google.grantWithdrawn = true
  await openSheet()
  await sheet().getByRole('button', { name: 'Read it again' }).click()
  await sheet().getByText(/no longer accepted/).waitFor({ timeout: 20000 })
  const withdrawn = await sheetText()
  check('the screen says the calendar cannot be read again',
    /cannot be read again/.test(withdrawn), true)
  check('and says what it leaves on the day',
    /stays until you reconnect or disconnect/.test(withdrawn), true)
  check('the row is kept, so reconnecting is one button rather than a fresh start',
    (await pb.api('GET', "/api/collections/calendar_links/records?filter=provider='google'", undefined, pb.su)).json.totalItems, 1)
  await closeSheet()
  check('and what it had already put on the day is still there',
    /19:00 to 20:00/.test(await dayText()), true)

  console.log('\nand reconnecting it')
  await openSheet()
  await sheet().getByRole('button', { name: 'Connect Google Calendar' }).click()
  await page.waitForURL(/\/day\?calendar=connected/, { timeout: 20000 })
  await sheet().waitFor({ timeout: 10000 })
  await sheet().getByRole('button', { name: 'Read it again' }).waitFor({ timeout: 20000 })
  check('reads again on the new grant', /no longer accepted/.test(await sheetText()), false)
  await closeSheet()
  check('and the day still holds the hour', /19:00 to 20:00/.test(await dayText()), true)

  console.log('\ndisconnecting')
  await openSheet()
  await sheet().getByRole('button', { name: 'Disconnect' }).click()
  await sheet().getByRole('button', { name: 'Connect Google Calendar' }).waitFor({ timeout: 10000 })
  check('Google was told to forget it too', google.revoked, true)
  check('the row is gone', (await pb.api('GET', '/api/collections/calendar_links/records', undefined, pb.su)).json.totalItems, 0)
  await closeSheet()
  check('and the day it shaped is its own again', /19:00 to 20:00/.test(await dayText()), false)

  console.log('\nan iCloud calendar, over CalDAV')
  await openSheet()
  const appleBefore = await sheetText()
  check('says what an app-specific password is not',
    /not the same as your Apple ID password|app-specific password you\s*make yourself/i.test(appleBefore), true)
  check('and that Apple is where it is revoked', /Apple is where you revoke it/.test(appleBefore), true)

  /* The wrong password first: somebody typing their Apple ID password has to be
     told now rather than have it stored and fail on the first read. */
  await sheet().getByLabel('Apple ID').fill('diary@icloud.test')
  await sheet().getByLabel('App-specific password').fill('my-normal-password')
  await sheet().getByRole('button', { name: 'Connect Apple Calendar' }).click()
  await sheet().getByText(/iCloud refused that/).waitFor({ timeout: 15000 })
  check('a password iCloud refuses is not stored',
    (await pb.api('GET', "/api/collections/calendar_links/records?filter=provider='apple'", undefined, pb.su)).json.totalItems, 0)

  await sheet().getByLabel('App-specific password').fill(APP_PASSWORD)
  await sheet().getByRole('button', { name: 'Connect Apple Calendar' }).click()
  await sheet().getByRole('button', { name: 'Read it again' }).last().waitFor({ timeout: 20000 })
  const appleOn = await sheetText()
  check('the Apple ID is shown back', /diary@icloud\.test/.test(appleOn), true)
  check('discovery ran, principal then home then the listing',
    icloud.calls.filter((c) => c.startsWith('PROPFIND')).length >= 3, true)
  check('and only the calendar that holds events was reported on',
    icloud.calls.filter((c) => c.startsWith('REPORT')).every((c) => c.includes('/calendars/home/')), true)

  /* The titles switch is one decision about this device rather than one per
     provider, and it was turned on in the Google section above. So the title
     arrives on the Apple blocks too, which is the switch being shared rather
     than a default being wrong. The next check is where that is asserted. */
  await closeSheet()
  const withApple = await dayText()
  check('the appointment is on the day, at its local hour', /16:00 to 17:00/.test(withApple), true)
  check('with the title, because the switch was already on', /Fisioterapeuta/.test(withApple), true)
  check('the all-day birthday is not on it', /Cumpleanos/.test(withApple), false)
  check('nor the hour iCloud marks free', /Fuera de la oficina/.test(withApple), false)

  console.log('\na Microsoft calendar, over Graph')
  await openSheet()
  const msBefore = await sheetText()
  check('it says the one extra thing it needs',
    /told which timezone you are in/.test(msBefore), true)
  await sheet().getByRole('button', { name: 'Connect Microsoft Calendar' }).click()
  await page.waitForURL(/\/day\?calendar=connected/, { timeout: 20000 })
  await sheet().waitFor({ timeout: 10000 })
  await sheet().getByText(/diary@outlook\.test/).waitFor({ timeout: 20000 })
  check('the account it belongs to is shown back', /diary@outlook\.test/.test(await sheetText()), true)
  check('the zone the device is in travelled',
    /outlook\.timezone="[A-Za-z0-9_+\-/]{3,64}"/.test(microsoft.lastPrefer), true)
  await closeSheet()
  const withMicrosoft = await dayText()
  check('the meeting is on the day at the hour Graph returned', /14:00 to 15:00/.test(withMicrosoft), true)
  check('the day off is not, because the calendar calls it free', /A day off/.test(withMicrosoft), false)
  check('nor the one they declined', /12:00 to 13:00/.test(withMicrosoft), false)

  console.log('\nthe token Microsoft rotates')
  /* Microsoft hands back a new refresh token on every exchange and refuses the
     old one. A connection that did not store it would read once and then say
     it had been withdrawn, which is the bug this asserts is absent.
     Addressed by panel rather than by index: three of these are on screen and
     "Read it again" means a different calendar in each. */
  const msPanel = () => sheet().getByRole('group', { name: 'Microsoft Calendar' })
  const rotationsBefore = microsoft.rotations
  await openSheet()
  await msPanel().getByRole('button', { name: 'Read it again' }).click()
  await page.waitForTimeout(2500)
  check('a second read used the rotated token rather than the first one',
    microsoft.rotations > rotationsBefore, true)
  check('and did not report itself withdrawn', /no longer accepted/.test(await msPanel().innerText()), false)
  await closeSheet()
  check('the hour is still on the day', /14:00 to 15:00/.test(await dayText()), true)

  console.log('\nputting Microsoft away again')
  await openSheet()
  await msPanel().getByRole('button', { name: 'Disconnect' }).click()
  await msPanel().getByRole('button', { name: 'Connect Microsoft Calendar' }).waitFor({ timeout: 15000 })
  await closeSheet()
  check('its hour went with it', /14:00 to 15:00/.test(await dayText()), false)
  check("and iCloud's did not", /16:00 to 17:00/.test(await dayText()), true)

  console.log('\ntwo calendars at once')
  /* Google was disconnected at the end of its own section, so it is connected
     again here: two providers on one account is the thing worth proving, and
     one pull must not touch the other's blocks. */
  await openSheet()
  await sheet().getByRole('button', { name: 'Connect Google Calendar' }).click()
  await page.waitForURL(/\/day\?calendar=connected/, { timeout: 20000 })
  await sheet().waitFor({ timeout: 10000 })
  await sheet().getByText(/diary@enforma\.test/).waitFor({ timeout: 20000 })
  check('the Apple one survived the round trip through Google',
    /diary@icloud\.test/.test(await sheetText()), true)
  const bothRows = await pb.api('GET', '/api/collections/calendar_links/records', undefined, pb.su)
  check('two rows, one per provider', bothRows.json.totalItems, 2)
  check('and neither holds the password as typed',
    bothRows.json.items.every((row) => row.secret !== APP_PASSWORD && row.secret.length > 0), true)
  await closeSheet()
  const both = await dayText()
  check("iCloud's hour is still on the day", /16:00 to 17:00/.test(both), true)
  check("and Google's is on it too", /19:00 to 20:00/.test(both), true)

  console.log('\na mirror of a calendar nobody can check')
  /* A link deleted anywhere but here — another device, a password revoked in
     Apple's own settings, a restored backup — has to reach this device too, and
     the blocks it mirrored have to go with it. Deleted from under the app on
     purpose, which is the only way to arrange that. */
  const appleRow = (await pb.api('GET', "/api/collections/calendar_links/records?filter=provider='apple'", undefined, pb.su)).json.items[0]
  await pb.api('DELETE', `/api/collections/calendar_links/records/${appleRow.id}`, undefined, pb.su)
  await page.reload({ waitUntil: 'networkidle' })
  await page.getByRole('heading', { name: 'Your day', level: 1 }).waitFor({ timeout: 10000 })
  await page.waitForTimeout(2000)
  check('the hours it put on the day are gone with it', /16:00 to 17:00/.test(await dayText()), false)
  check("and Google's, which is still connected, are not", /19:00 to 20:00/.test(await dayText()), true)
  /* Connected again, so the section below has something to disconnect. */
  await openSheet()
  await sheet().getByLabel('Apple ID').fill('diary@icloud.test')
  await sheet().getByLabel('App-specific password').fill(APP_PASSWORD)
  await sheet().getByRole('button', { name: 'Connect Apple Calendar' }).click()
  await sheet().getByRole('button', { name: 'Read it again' }).last().waitFor({ timeout: 20000 })
  await closeSheet()
  check('and it comes back when it is connected again', /16:00 to 17:00/.test(await dayText()), true)

  console.log('\ndisconnecting one of them')
  await openSheet()
  /* The Apple panel is the second of the two, so its buttons are the last. */
  await sheet().getByRole('button', { name: 'Disconnect' }).last().click()
  await sheet().getByRole('button', { name: 'Connect Apple Calendar' }).waitFor({ timeout: 15000 })
  check('its row is gone', (await pb.api('GET', "/api/collections/calendar_links/records?filter=provider='apple'", undefined, pb.su)).json.totalItems, 0)
  check("and Google's is not", (await pb.api('GET', "/api/collections/calendar_links/records?filter=provider='google'", undefined, pb.su)).json.totalItems, 1)
  await closeSheet()
  const afterApple = await dayText()
  check('the hour it put on the day went with it', /16:00 to 17:00/.test(afterApple), false)
  check("and Google's stayed", /19:00 to 20:00/.test(afterApple), true)

  /* And Google goes too, so the sections below see the day the way they were
     written to see it: no calendar attached and nothing on it but the anchors. */
  await openSheet()
  await sheet().getByRole('button', { name: 'Disconnect' }).first().click()
  await sheet().getByRole('button', { name: 'Connect Google Calendar' }).waitFor({ timeout: 15000 })
  await closeSheet()
  check('with both gone, the day keeps none of their hours',
    /19:00 to 20:00|16:00 to 17:00/.test(await dayText()), false)

  console.log('\nan event the gym published')
  /**
   * Seeded into the device bus rather than published through the gym panel,
   * which `test-gym-flow` already walks end to end. What is new here is the
   * day planner reading it, and that is what this exercises: the same row
   * shape the bus holds, unanswered first and answered second, so the rule
   * that decides between them is the thing under test.
   */
  const eventDate = await page.evaluate(() => {
    const at = new Date()
    return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`
  })
  const seed = async (rsvp) => {
    await page.evaluate(
      ([date, answer]) => {
        const raw = localStorage.getItem('forma-gym-messages')
        const rows = raw ? JSON.parse(raw) : []
        const mine = rows.filter((r) => r.id !== 'seeded-event')
        mine.push({
          id: 'seeded-event',
          gym: '',
          authorId: 'op-seed',
          createdAt: new Date().toISOString(),
          kind: 'event',
          /* The open door: the scope that reaches somebody with no gym, which
             is what "what is on near me" actually means for this member. A
             default-scoped message would need them to belong to the gym that
             sent it. */
          scope: 'open-door',
          title: 'Salsa night at the club',
          audience: 'all',
          readBy: [],
          rsvp: answer,
          saved: [],
          event: { date, time: '20:00', place: 'The club' },
        })
        localStorage.setItem('forma-gym-messages', JSON.stringify(mine))
      },
      [eventDate, rsvp],
    )
    await page.goto(`${BASE}/day`, { waitUntil: 'networkidle' })
    await page.getByRole('heading', { name: 'Your day', level: 1 }).waitFor({ timeout: 10000 })
  }

  /* Unanswered: an invitation, not a commitment. */
  await seed({})
  const unanswered = await dayText()
  check('an invitation does not touch the day', /Salsa night/.test(unanswered), false)

  /* Answered yes: something they said they would turn up to. */
  const profileId = await page.evaluate(() => {
    const raw = localStorage.getItem('forma-profiles')
    const parsed = raw ? JSON.parse(raw) : null
    return parsed?.profiles?.[0]?.id ?? null
  })
  check('the walk found the profile it is answering as', typeof profileId, 'string')
  await seed({ [profileId]: 'yes' })
  const answered = await dayText()
  check('one they said yes to is on the day', /Salsa night at the club/.test(answered), true)
  check('at the hour it was answered for', /20:00 to 21:00/.test(answered), true)

  /* Cleared before the checks below, which are about an empty day. Leaving a
     seeded hour on it would have made three later assertions fail for a reason
     that has nothing to do with what they test. */
  await page.evaluate(() => {
    const raw = localStorage.getItem('forma-gym-messages')
    const rows = raw ? JSON.parse(raw) : []
    localStorage.setItem(
      'forma-gym-messages',
      JSON.stringify(rows.filter((r) => r.id !== 'seeded-event')),
    )
  })
  /* And reloaded, because the bus is hydrated from localStorage on boot and a
     same-tab write raises no storage event. Without this the store still holds
     the seeded hour and the checks below count it. */
  await page.goto(`${BASE}/day`, { waitUntil: 'networkidle' })
  await page.getByRole('heading', { name: 'Your day', level: 1 }).waitFor({ timeout: 10000 })

  console.log('\nwhat is on near them')
  /* Still on /day from the gym event above, with the salsa night at eight. */
  const beforeNear = await dayText()
  check('is offered, and says what leaves the device', /five kilometre cell/.test(beforeNear), true)
  check('and nothing was asked before anybody tapped', tm.hits, 0)
  await main().getByRole('button', { name: 'Use my location' }).click()
  await main().getByText('Fake Quartet').first().waitFor({ timeout: 15000 })
  check('the cell went, and no coordinate did',
    /geoPoint=[0-9b-hjkmnp-z]{5}&/.test(tm.lastUrl) && !/lat/.test(tm.lastUrl), true)
  const near = await dayText()
  check('the one with no hour cannot be added',
    await main().getByRole('button', { name: 'Add to my day' }).count(), 2)
  check('and says so instead', /No time given/.test(near), true)
  check('an insecure ticket link is dropped',
    await main().getByRole('link', { name: /^Tickets/ }).count(), 2)
  await main().getByRole('button', { name: 'Add to my day' }).first().click()
  await page.waitForTimeout(500)
  const withOuting = await dayText()
  check("tonight's is on the day, at its hour, for two hours",
    /Fake Quartet/.test(withOuting) && /20:00 to 22:00/.test(withOuting), true)
  check('and the card says so', /On your day/.test(withOuting), true)
  const asked = tm.hits
  await page.reload({ waitUntil: 'networkidle' })
  await main().getByText('Fake Quartet').first().waitFor({ timeout: 15000 })
  check('a reload is answered from the cache', tm.hits, asked)
  check('and the outing survived it', /On your day/.test(await dayText()), true)
  await main().getByRole('button', { name: 'Take it off' }).click()
  await page.waitForTimeout(400)
  check('taking it off takes it off the day too', /20:00 to 22:00/.test(await dayText()), false)
  await main().getByRole('button', { name: 'Somewhere else' }).click()
  await main().getByLabel('Or a city').fill('Lisboa')
  await main().getByRole('button', { name: 'Look there' }).click()
  await main().getByText('Fake Quartet').first().waitFor({ timeout: 15000 })
  check('a typed city goes as a city, lower-cased', /city=lisboa/.test(tm.lastUrl), true)

  console.log('\nanother day than this one')
  /* The whole point of storing a fortnight of events and three weeks of
     calendar: being able to look at the day they land on. The away match is
     three days out, which is where it has to appear and where it has to not. */
  /* The strip's cards are list items, not articles: the articles on this app
     belong to the intimate activity module. */
  const matchCard = main().locator('li').filter({ hasText: 'Away match' })
  await matchCard.getByRole('button', { name: 'Add to my day' }).click()
  await page.waitForTimeout(400)
  check('a match three days out is not on today', /18:30 to 20:30/.test(await dayText()), false)
  check('and today cannot step backwards',
    await main().getByRole('button', { name: 'The day before' }).isDisabled(), true)

  for (let i = 0; i < 3; i += 1) {
    await main().getByRole('button', { name: 'The day after' }).click()
    await page.waitForTimeout(400)
  }
  const thirdDay = await dayText()
  /* The hours, not the name: the name is also on the card in the strip below,
     which is on screen whichever day is drawn. */
  check('three days on, it is on that day at its hour', /18:30 to 20:30/.test(thirdDay), true)
  check("and today's own events are not", /Salsa night/.test(thirdDay), false)
  check('the day is in the URL, so a reload lands here', /[?&]d=\d{4}-\d{2}-\d{2}/.test(page.url()), true)
  /* "Now" means nothing on a day that is not today, and the tile says the free
     total instead of counting down to something. */
  check('and nothing pretends to be live on it', /until bed|left, ends/.test(thirdDay), false)
  check('the tile gives the total instead', /across the day/.test(thirdDay), true)

  await page.reload({ waitUntil: 'networkidle' })
  await page.getByRole('heading', { name: 'Your day', level: 1 }).waitFor({ timeout: 10000 })
  check('which it does', /18:30 to 20:30/.test(await dayText()), true)

  await main().getByRole('button', { name: 'Today', exact: true }).click()
  await page.waitForTimeout(400)
  const backToday = await dayText()
  check('and Today comes back', /18:30 to 20:30/.test(backToday), false)
  /* And the URL drops the day rather than carrying `?d=<today>` around, so the
     address of today stays the address everything else links to. */
  check('and the day comes out of the URL with it', /[?&]d=/.test(page.url()), false)

  await main().getByRole('button', { name: 'Somewhere else' }).click()
  await page.waitForTimeout(300)

  console.log('\nthe intimate activity module')
  await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle' })
  await page.getByRole('tab', { name: /^Data/ }).click()
  const module_ = page.getByRole('region', { name: 'Intimate activity' })
  await module_.waitFor({ timeout: 8000 })
  check('is offered to a Pro account', (await module_.innerText()).length > 0, true)
  check('and is off', /\bOff\b/.test(await module_.innerText()), true)
  check('with the eighteen line before the switch', /over eighteen/.test(await module_.innerText()), true)

  /* Typing the URL is the only way in with it off, and it says so rather than
     drawing the module. */
  await page.goto(`${BASE}/intimacy`, { waitUntil: 'networkidle' })
  const shut = await dayText()
  check('the screen refuses while it is off', /Switched off/.test(shut), true)
  check('and draws none of the content', /Arrangements/.test(shut), false)

  console.log('\nswitched on')
  await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle' })
  await page.getByRole('tab', { name: /^Data/ }).click()
  await page.getByRole('switch', { name: 'Show intimate activity' }).click()
  await page.waitForTimeout(400)
  check('the switch holds', /On, on this device/.test(await module_.innerText()), true)
  await page.getByRole('button', { name: /^Open it/ }).click()
  await page.getByRole('heading', { name: 'Time together', level: 1 }).waitFor({ timeout: 10000 })
  const open = await dayText()
  check('the arrangements are there', /Arrangements/.test(open), true)
  check('with the effort in units somebody can check', /MET/.test(open), true)
  check('and no calorie figure anywhere', /\bkcal\b|\bcalorie/i.test(open), false)
  check('nothing is counted or streaked', /streak|in a row|days? running/i.test(open), false)
  check('and it says what it is not', /not medical advice/.test(open), true)
  await page.screenshot({ path: path.join(SHOTS, 'intimacy.png'), fullPage: false })

  /* `a11y-sweep.mjs` reaches /intimacy with the module off, so what it sweeps
     there is the notice. The screen itself only exists for a Pro account that
     has switched it on, which is what this walk is holding. */
  const moduleAxe = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  check(
    'no serious or critical violations on the module',
    moduleAxe.violations
      .filter((v) => v.impact === 'serious' || v.impact === 'critical')
      .map((v) => `${v.id} (${v.nodes.length}) ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`),
    [],
  )

  /**
   * The cards in the Arrangements list, and nothing else.
   *
   * The day's suggestion and anything the coach picks are `<article>` too,
   * because that is what they are, so counting every article on the screen was
   * counting three lists as one.
   */
  const cards = () =>
    main().locator('section').filter({ hasText: 'Arrangements' }).getByRole('article')

  console.log('\nthe half hour on the day, and what is behind it')
  const chosen = await main().locator('section').filter({ hasText: 'For your half hour today' })
  check('one arrangement is chosen for today', await chosen.count(), 1)
  const chosenName = (await chosen.locator('h3').first().innerText()).trim()
  check('it is named', chosenName.length > 0, true)
  check('and the screen says the day shows the half hour rather than this',
    /Your day shows the half hour, not this/.test(await dayText()), true)
  await page.reload({ waitUntil: 'networkidle' })
  await page.getByRole('heading', { name: 'Time together', level: 1 }).waitFor({ timeout: 10000 })
  check('the same one after a reload, because it is the day and not a shuffle',
    (await main().locator('section').filter({ hasText: 'For your half hour today' }).locator('h3').first().innerText()).trim(),
    chosenName)

  console.log('\nwhat is being worked around is remembered')
  await page.getByRole('button', { name: 'Knees' }).click()
  await page.waitForTimeout(400)
  const withKnees = await cards().count()
  await page.reload({ waitUntil: 'networkidle' })
  await page.getByRole('heading', { name: 'Time together', level: 1 }).waitFor({ timeout: 10000 })
  check('the chip is still pressed after a reload',
    await page.getByRole('button', { name: 'Knees' }).getAttribute('aria-pressed'), 'true')
  check('and the list is still narrowed', await cards().count(), withKnees)
  check('the screen says where it is kept and that it never leaves',
    /kept on this device, so your day can use it. It is never\s*synced and never sent anywhere/.test(await dayText()), true)
  /* And it never reaches the synced record, which is the whole point. */
  const envelopes = await page.evaluate(() =>
    Object.keys(localStorage).filter((k) => k.startsWith('forma-intimacy')),
  )
  check('it lives beside the switch, outside anything that syncs',
    envelopes.includes('forma-intimacy-limits'), true)

  console.log('\nasking the coach to choose from the list')
  await page.getByLabel('Search').fill('something for a night when we are both exhausted')
  await page.waitForTimeout(300)
  check('the local search finds nothing for a sentence like that',
    await cards().count(), 0)
  const coachPanel = main().locator('section').filter({ hasText: 'Or say what you are after' })
  check('so the coach is offered', await coachPanel.count(), 1)
  check('and it says what is sent and what is not',
    /What you are working around is not sent/.test(await coachPanel.innerText()), true)
  await coachPanel.getByRole('button', { name: 'Ask the coach to choose' }).click()
  await coachPanel.getByText('Neither person carries any weight.').waitFor({ timeout: 20000 })
  const picked = await coachPanel.innerText()
  check('it named two arrangements from the list', /Side by side, one behind/.test(picked), true)
  check('and the id it invented reached no screen', /wheelbarrow|Invented/i.test(picked), false)

  await page.getByLabel('Search').fill('')
  await page.getByRole('button', { name: 'Knees' }).click()
  await page.waitForTimeout(400)

  console.log('\nthe place the illustrations will go')
  /* Nothing is drawn yet, and the honest state is an empty frame per card
     rather than a stand-in drawing or a collapsed layout. Both halves are
     asserted: the frames are there, and no image is. */
  /* Scoped to the list for the same reason the counting is: the day's
     suggestion and the coach's picks keep a frame each too, which is right and
     is not what this check is about. */
  const list = main().locator('section').filter({ hasText: 'Arrangements' })
  check('every card keeps the space for one', await list.getByText('Illustration to come').count(),
    await cards().count())
  check('and nothing was drawn to fill it', await main().locator('img').count(), 0)
  check('the screen says so once, rather than once a card',
    (await dayText()).match(/The illustrations are being drawn/g)?.length ?? 0, 1)

  console.log('\nthe search, which is the feature')
  const before = await cards().count()
  await page.getByRole('button', { name: 'Knees' }).click()
  await page.waitForTimeout(300)
  const after = await cards().count()
  check('naming a limitation shortens the list', after < before, true)
  check('and says how many were left out', /left out/.test(await dayText()), true)
  check('but never to nothing', after > 0, true)

  /* A second axis narrows again: across axes the chips are requirements. */
  await page.getByRole('button', { name: 'Light', exact: true }).click()
  await page.waitForTimeout(300)
  const andLight = await cards().count()
  check('a second axis narrows it further', andLight <= after, true)
  /* The cards, not the page: "Vigorous" is also the label on a chip that is
     still sitting there unpressed, and asserting over the whole screen would
     have been a test of the filter row rather than of the filter. */
  const cardText = async () =>
    (await cards().allInnerTexts()).join(' ').replace(/\s+/g, ' ')
  const lightOnly = await cardText()
  check('and what is left is all light',
    /Light/.test(lightOnly) && !/Moderate|Vigorous/.test(lightOnly), true)

  await page.getByRole('button', { name: 'Clear it' }).first().click()
  await page.waitForTimeout(300)
  check('clearing it puts the whole library back', await cards().count(), before)

  await page.getByLabel('Search').fill('pillow')
  await page.waitForTimeout(300)
  const searched = await cards().count()
  check('typing a word somebody would type finds something', searched > 0, true)
  check('and not everything', searched < before, true)
  await page.getByLabel('Search').fill('trampoline')
  await page.waitForTimeout(300)
  check('a word that is in none of them finds none', await cards().count(), 0)
  check('and offers a way back rather than a dead end',
    /Nothing matches all of that/.test(await dayText()), true)
  await main().getByRole('button', { name: 'Clear it' }).last().click()
  await page.waitForTimeout(300)
  check('which works', await cards().count(), before)

  console.log('\nwhat the day does with it')
  await page.goto(`${BASE}/day`, { waitUntil: 'networkidle' })
  await page.getByRole('heading', { name: 'Your day', level: 1 }).waitFor({ timeout: 10000 })
  const dayWithModule = await dayText()
  check('half an hour on the day, neutrally labelled', /Time together/.test(dayWithModule), true)

  console.log('\nand what the calendar file does not')
  await openSheet()
  const exported = page.waitForEvent('download', { timeout: 10000 })
  await sheet().getByRole('button', { name: /Send today to my calendar/ }).click()
  const icsFile = await exported
  await closeSheet()
  const icsText = await readFile(await icsFile.path(), 'utf8')
  /* The one thing on that screen that leaves the device by design. Everything
     about this module stays on one device on purpose, and an export carrying it
     out would undo that where nobody would notice. */
  check('the day is in the file', /BEGIN:VEVENT/.test(icsText), true)
  check('and the module is not', /Time together/.test(icsText), false)

  console.log('\nforgetting it')
  await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle' })
  await page.getByRole('tab', { name: /^Data/ }).click()
  await page.getByRole('button', { name: /Forget it on this device/ }).click()
  await page.waitForTimeout(400)
  check('back to off', /\bOff\b/.test(await module_.innerText()), true)
  check('and asking again', /over eighteen/.test(await module_.innerText()), true)
  await page.goto(`${BASE}/day`, { waitUntil: 'networkidle' })
  await page.getByRole('heading', { name: 'Your day', level: 1 }).waitFor({ timeout: 10000 })
  check('and gone from the day', /Time together/.test(await dayText()), false)

  console.log('\ntaking it back off')
  await openSheet()
  await sheet().getByRole('button', { name: 'Remove school run' }).click()
  await page.waitForTimeout(400)
  await sheet().getByRole('button', { name: 'Remove work' }).click()
  await page.waitForTimeout(500)
  check('the editor says so', /Nothing fixed yet/.test(await sheetText()), true)
  await closeSheet()
  const afterRemove = await dayText()
  check('the anchor is gone', /Nothing on it yet/.test(afterRemove), true)
  check('and the day is whole again', /16h free/.test(afterRemove), true)

  console.log('\nToday, with a day that holds nothing')
  await page.goto(BASE, { waitUntil: 'networkidle' })
  /* The line does not render at all here, and that is the intended behaviour:
     Today already says an empty day is empty, and a second line repeating it is
     furniture. */
  check('carries no line', /No session today|free/.test(await dayText()), false)

  console.log('\nthe console')
  check('nothing threw', errors, [])
} finally {
  await browser.close()
  await pb.stop()
  coach.close()
  ticketmaster.close()
  googleServer.close()
  icloudServer.close()
  microsoftServer.close()
}

console.log(failures === 0 ? '\nall clear\n' : `\n${failures} failed\n`)
process.exit(failures === 0 ? 0 : 1)
