import { beforeAll, describe, expect, it } from 'vitest'
import source from '../../deploy/pocketbase/pb_hooks/utils/caldav.js?raw'

/**
 * The CalDAV helpers, against the file PocketBase loads.
 *
 * Two things carry the weight here. The XML is read by regex because there is
 * no parser in that runtime, so every extraction is checked against responses
 * shaped the way iCloud actually shapes them — namespaced with prefixes it
 * chooses, with the collections nobody wants mixed in among the ones they do.
 * And Basic authentication is assembled by hand for want of `btoa`, which is
 * exactly the kind of code that works on the happy path and pads wrongly at
 * the end, so the padding is what gets tested.
 */
interface Shipped {
  DAYS_AHEAD: number
  MAX_CALENDARS: number
  ICLOUD: string
  davBase: () => string
  basic: (user: string, password: string) => string
  PRINCIPAL_BODY: string
  HOME_BODY: string
  CALENDARS_BODY: string
  windowFor: (nowMs: number) => { from: string; to: string }
  queryBody: (w: { from: string; to: string }) => string
  firstTag: (xml: string, local: string) => string
  principalHref: (xml: string) => string
  homeHref: (xml: string) => string
  eventCalendars: (xml: string) => { href: string; name: string }[]
  calendarData: (xml: string) => string[]
  absolute: (base: string, href: string) => string
  isRefusal: (status: number) => boolean
}

const shipped = { exports: {} as Shipped }
let dav: Shipped

beforeAll(() => {
  ;(globalThis as unknown as { $os: unknown }).$os = { getenv: () => '' }
  new Function('module', 'exports', source)(shipped, shipped.exports)
  dav = shipped.exports
})

describe('basic', () => {
  it('encodes the three padding cases, which is where hand-rolled base64 breaks', () => {
    /* Lengths of 3n, 3n+1 and 3n+2. Checked against the known answers. */
    expect(dav.basic('abc', 'de')).toBe('Basic YWJjOmRl')
    expect(dav.basic('a', 'b')).toBe('Basic YTpi')
    expect(dav.basic('ab', 'cd')).toBe('Basic YWI6Y2Q=')
    expect(dav.basic('you@icloud.com', 'abcd-efgh-ijkl-mnop')).toBe(
      'Basic eW91QGljbG91ZC5jb206YWJjZC1lZmdoLWlqa2wtbW5vcA==',
    )
  })
})

describe('the requests', () => {
  it('defaults to iCloud and can be pointed elsewhere for a walk', () => {
    expect(dav.ICLOUD).toBe('https://caldav.icloud.com')
    expect(dav.davBase()).toBe('https://caldav.icloud.com')
  })

  it('asks for three weeks in the only date format a time-range takes', () => {
    const window = dav.windowFor(Date.UTC(2026, 8, 4, 12, 0, 0))
    expect(window.from).toBe('20260904T120000Z')
    expect(window.to).toBe('20260925T120000Z')
    expect(dav.DAYS_AHEAD).toBe(21)
  })

  it('queries events in the range and does not expand them', () => {
    const body = dav.queryBody({ from: '20260904T120000Z', to: '20260925T120000Z' })
    expect(body).toContain('<c:comp-filter name="VEVENT">')
    expect(body).toContain('<c:time-range start="20260904T120000Z" end="20260925T120000Z"/>')
    expect(body).toContain('<c:calendar-data/>')
    /* Expansion is what would force UTC on the answer and take the timezone
       away from the device that has one. */
    expect(body).not.toContain('expand')
  })

  it('asks for the properties each discovery step needs and nothing more', () => {
    expect(dav.PRINCIPAL_BODY).toContain('current-user-principal')
    expect(dav.HOME_BODY).toContain('calendar-home-set')
    expect(dav.CALENDARS_BODY).toContain('supported-calendar-component-set')
    expect(dav.CALENDARS_BODY).toContain('resourcetype')
  })
})

/* Shaped the way iCloud shapes it: its own prefixes, and the collections
   nobody wants sitting among the ones they do. */
const PRINCIPAL = `<?xml version="1.0" encoding="UTF-8"?>
<multistatus xmlns="DAV:">
  <response>
    <href>/</href>
    <propstat>
      <prop><current-user-principal><href>/1234567890/principal/</href></current-user-principal></prop>
      <status>HTTP/1.1 200 OK</status>
    </propstat>
  </response>
</multistatus>`

const HOME = `<?xml version="1.0" encoding="UTF-8"?>
<multistatus xmlns="DAV:" xmlns:cal="urn:ietf:params:xml:ns:caldav">
  <response>
    <href>/1234567890/principal/</href>
    <propstat>
      <prop><cal:calendar-home-set><href>/1234567890/calendars/</href></cal:calendar-home-set></prop>
      <status>HTTP/1.1 200 OK</status>
    </propstat>
  </response>
</multistatus>`

const LISTING = `<?xml version="1.0" encoding="UTF-8"?>
<multistatus xmlns="DAV:" xmlns:cal="urn:ietf:params:xml:ns:caldav">
  <response>
    <href>/1234567890/calendars/</href>
    <propstat><prop><resourcetype><collection/></resourcetype><displayname/></prop></propstat>
  </response>
  <response>
    <href>/1234567890/calendars/home/</href>
    <propstat><prop>
      <resourcetype><collection/><cal:calendar/></resourcetype>
      <displayname>Home</displayname>
      <cal:supported-calendar-component-set><cal:comp name="VEVENT"/></cal:supported-calendar-component-set>
    </prop></propstat>
  </response>
  <response>
    <href>/1234567890/calendars/tasks/</href>
    <propstat><prop>
      <resourcetype><collection/><cal:calendar/></resourcetype>
      <displayname>Reminders</displayname>
      <cal:supported-calendar-component-set><cal:comp name="VTODO"/></cal:supported-calendar-component-set>
    </prop></propstat>
  </response>
  <response>
    <href>/1234567890/calendars/inbox/</href>
    <propstat><prop>
      <resourcetype><collection/><cal:schedule-inbox/></resourcetype><displayname>Inbox</displayname>
    </prop></propstat>
  </response>
  <response>
    <href>/1234567890/calendars/work/</href>
    <propstat><prop>
      <resourcetype><collection/><cal:calendar/></resourcetype>
      <displayname>Work</displayname>
      <cal:supported-calendar-component-set><cal:comp name="VEVENT"/><cal:comp name="VTODO"/></cal:supported-calendar-component-set>
    </prop></propstat>
  </response>
</multistatus>`

describe('discovery', () => {
  it('finds the principal and the calendar home through whatever prefixes were used', () => {
    expect(dav.principalHref(PRINCIPAL)).toBe('/1234567890/principal/')
    expect(dav.homeHref(HOME)).toBe('/1234567890/calendars/')
  })

  it('answers nothing rather than guessing when the property is absent', () => {
    expect(dav.principalHref('<multistatus xmlns="DAV:"></multistatus>')).toBe('')
    expect(dav.homeHref('not xml at all')).toBe('')
    expect(dav.principalHref('')).toBe('')
  })

  it('keeps the calendars that hold events and nothing else', () => {
    const found = dav.eventCalendars(LISTING)
    /* The home itself is a plain collection, the reminders list supports only
       VTODO, and the scheduling inbox is not a calendar at all. */
    expect(found.map((c) => c.href)).toEqual([
      '/1234567890/calendars/home/',
      '/1234567890/calendars/work/',
    ])
    expect(found[0].name).toBe('Home')
  })

  it('is bounded, so one account with a hundred calendars cannot spend all afternoon', () => {
    const many = Array.from({ length: 40 }, (_, i) =>
      `<response><href>/c/${i}/</href><propstat><prop>` +
      '<resourcetype><collection/><cal:calendar/></resourcetype>' +
      '<cal:supported-calendar-component-set><cal:comp name="VEVENT"/></cal:supported-calendar-component-set>' +
      '</prop></propstat></response>',
    ).join('')
    expect(dav.eventCalendars(`<multistatus>${many}</multistatus>`)).toHaveLength(dav.MAX_CALENDARS)
  })
})

describe('calendarData', () => {
  const REPORT = `<?xml version="1.0" encoding="UTF-8"?>
<multistatus xmlns="DAV:" xmlns:cal="urn:ietf:params:xml:ns:caldav">
  <response>
    <href>/1234567890/calendars/home/one.ics</href>
    <propstat><prop><cal:calendar-data>BEGIN:VCALENDAR&#13;
VERSION:2.0&#13;
BEGIN:VEVENT&#13;
SUMMARY:Dentist &amp; hygienist&#13;
DTSTART;TZID=Europe/Madrid:20260904T190000&#13;
DTEND;TZID=Europe/Madrid:20260904T200000&#13;
END:VEVENT&#13;
END:VCALENDAR</cal:calendar-data></prop></propstat>
  </response>
  <response>
    <href>/1234567890/calendars/home/two.ics</href>
    <propstat><prop><cal:calendar-data></cal:calendar-data></prop></propstat>
  </response>
</multistatus>`

  it('pulls the iCalendar out and unescapes what XML escaped', () => {
    const found = dav.calendarData(REPORT)
    expect(found).toHaveLength(1)
    expect(found[0]).toContain('SUMMARY:Dentist & hygienist')
    expect(found[0].startsWith('BEGIN:VCALENDAR')).toBe(true)
  })

  it('drops anything that is not a calendar, and survives nonsense', () => {
    expect(dav.calendarData('<multistatus><response><cal:calendar-data>nope</cal:calendar-data></response></multistatus>')).toEqual([])
    expect(dav.calendarData('')).toEqual([])
    expect(dav.calendarData('<html>error page</html>')).toEqual([])
  })
})

describe('absolute', () => {
  it('joins a path to its base and leaves a full URL alone', () => {
    expect(dav.absolute('https://caldav.icloud.com/', '/1/principal/')).toBe(
      'https://caldav.icloud.com/1/principal/',
    )
    expect(dav.absolute('https://caldav.icloud.com', '1/calendars/')).toBe(
      'https://caldav.icloud.com/1/calendars/',
    )
    expect(dav.absolute('https://caldav.icloud.com', 'https://p02.icloud.com/1/')).toBe(
      'https://p02.icloud.com/1/',
    )
    expect(dav.absolute('https://x', '')).toBe('')
  })
})

describe('isRefusal', () => {
  it('is the two statuses that mean the password is wrong, and not the rest', () => {
    expect(dav.isRefusal(401)).toBe(true)
    expect(dav.isRefusal(403)).toBe(true)
    expect(dav.isRefusal(207)).toBe(false)
    expect(dav.isRefusal(500)).toBe(false)
  })
})
