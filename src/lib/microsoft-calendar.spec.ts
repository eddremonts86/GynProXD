import { beforeAll, describe, expect, it } from 'vitest'
import source from '../../deploy/pocketbase/pb_hooks/utils/microsoft_calendar.js?raw'

/**
 * The Graph helpers, against the file PocketBase loads.
 *
 * Two things carry the weight. The timezone name goes straight into a `Prefer`
 * header, so what `isZone` refuses is a header-injection test rather than a
 * tidiness one. And an event that does not block time must not become a block:
 * Graph says the same four things Google and iCloud say, in its own words, and
 * getting one wrong empties somebody's day without telling them.
 */
interface Block {
  date: string
  start: string
  end: string
  title: string
}
interface Shipped {
  SCOPE: string
  DAYS_AHEAD: number
  MAX_EVENTS: number
  authorizeUrl: (base: string, id: string, redirect: string, state: string) => string
  codeExchangeBody: (code: string, id: string, secret: string, redirect: string) => string
  refreshBody: (token: string, id: string, secret: string) => string
  isZone: (value: unknown) => boolean
  windowFor: (nowMs: number) => { from: string; to: string }
  calendarViewUrl: (base: string, w: { from: string; to: string }) => string
  blockFrom: (event: unknown) => Block | null
  busyFrom: (json: unknown) => Block[]
}

const shipped = { exports: {} as Shipped }
let ms: Shipped

beforeAll(() => {
  ;(globalThis as unknown as { $os: unknown }).$os = { getenv: () => '' }
  new Function('module', 'exports', source)(shipped, shipped.exports)
  ms = shipped.exports
})

describe('the requests', () => {
  it('asks to read calendars and to keep reading them, and nothing else', () => {
    expect(ms.SCOPE).toBe('offline_access Calendars.Read')
    const url = ms.authorizeUrl('https://login.microsoftonline.com/common/', 'id', 'https://x/cb', 's&t')
    expect(url.startsWith('https://login.microsoftonline.com/common/oauth2/v2.0/authorize?')).toBe(true)
    expect(url).toContain('scope=offline_access%20Calendars.Read')
    expect(url).toContain('response_mode=query')
    expect(url).toContain('state=s%26t')
    /* Nothing that could write, and nothing about a profile. */
    expect(url).not.toMatch(/Calendars\.ReadWrite|User\.Read/)
  })

  it('sends the client secret only in a POST body', () => {
    expect(ms.codeExchangeBody('the-code', 'id', 'shh', 'https://x/cb')).toContain('client_secret=shh')
    expect(ms.codeExchangeBody('the-code', 'id', 'shh', 'https://x/cb')).toContain('grant_type=authorization_code')
    expect(ms.refreshBody('r-token', 'id', 'shh')).toContain('grant_type=refresh_token')
  })

  it('reads three weeks of expanded occurrences, in order', () => {
    const window = ms.windowFor(Date.UTC(2026, 8, 4, 12, 0, 0))
    expect(window.from).toBe('2026-09-04T12:00:00')
    expect(window.to).toBe('2026-09-25T12:00:00')
    expect(ms.DAYS_AHEAD).toBe(21)
    const url = ms.calendarViewUrl('https://graph.microsoft.com/v1.0', window)
    /* calendarView rather than /events, for the same reason Google's read asks
       for singleEvents: the provider walks the recurrence rules. */
    expect(url).toContain('/me/calendarView?')
    expect(url).toContain('startDateTime=2026-09-04T12%3A00%3A00')
    expect(url).toContain('$orderby=start/dateTime')
  })
})

describe('isZone', () => {
  it('takes an IANA name', () => {
    for (const zone of ['Europe/Madrid', 'UTC', 'America/Argentina/Buenos_Aires', 'Etc/GMT+3']) {
      expect(ms.isZone(zone)).toBe(true)
    }
  })

  it('refuses anything that could get out of the header it goes into', () => {
    for (const bad of [
      'Europe/Madrid"',
      'Europe/Madrid\r\nX-Evil: 1',
      'Europe/Madrid; drop',
      'a',
      'x'.repeat(80),
      undefined,
      42,
    ]) {
      expect(ms.isZone(bad)).toBe(false)
    }
  })
})

describe('blockFrom', () => {
  const meeting = {
    subject: 'Standup',
    isAllDay: false,
    isCancelled: false,
    showAs: 'busy',
    start: { dateTime: '2026-09-04T09:30:00.0000000', timeZone: 'Europe/Madrid' },
    end: { dateTime: '2026-09-04T10:00:00.0000000', timeZone: 'Europe/Madrid' },
  }

  it('reads the times as written, because they were asked for in the right zone', () => {
    expect(ms.blockFrom(meeting)).toEqual({
      date: '2026-09-04',
      start: '09:30',
      end: '10:00',
      title: 'Standup',
    })
  })

  it('takes nothing that does not block time', () => {
    expect(ms.blockFrom({ ...meeting, isCancelled: true })).toBeNull()
    expect(ms.blockFrom({ ...meeting, isAllDay: true })).toBeNull()
    expect(ms.blockFrom({ ...meeting, showAs: 'free' })).toBeNull()
    expect(ms.blockFrom({ ...meeting, showAs: 'Free' })).toBeNull()
    expect(
      ms.blockFrom({ ...meeting, responseStatus: { response: 'declined' } }),
    ).toBeNull()
    /* Anything else they answered is still on the day. */
    expect(ms.blockFrom({ ...meeting, responseStatus: { response: 'accepted' } })?.start).toBe('09:30')
  })

  it('clips an event that runs past midnight to the day it starts on', () => {
    expect(
      ms.blockFrom({
        ...meeting,
        start: { dateTime: '2026-09-04T22:00:00.0000000' },
        end: { dateTime: '2026-09-05T02:00:00.0000000' },
      }),
    ).toEqual({ date: '2026-09-04', start: '22:00', end: '23:59', title: 'Standup' })
  })

  it('refuses one that ends before it starts, and one with no times', () => {
    expect(ms.blockFrom({ ...meeting, end: { dateTime: '2026-09-04T09:00:00.0000000' } })).toBeNull()
    expect(ms.blockFrom({ subject: 'Nothing' })).toBeNull()
    expect(ms.blockFrom(null)).toBeNull()
  })
})

describe('busyFrom', () => {
  it('keeps what blocks time, in order, and survives nonsense', () => {
    const out = ms.busyFrom({
      value: [
        { subject: 'Late', start: { dateTime: '2026-09-05T18:00:00' }, end: { dateTime: '2026-09-05T19:00:00' } },
        { subject: 'Birthday', isAllDay: true, start: { dateTime: '2026-09-04T00:00:00' }, end: { dateTime: '2026-09-05T00:00:00' } },
        { subject: 'Early', start: { dateTime: '2026-09-04T08:00:00' }, end: { dateTime: '2026-09-04T09:00:00' } },
      ],
    })
    expect(out.map((b) => b.title)).toEqual(['Early', 'Late'])
    expect(ms.busyFrom(null)).toEqual([])
    expect(ms.busyFrom({ value: 'soon' })).toEqual([])
  })
})
