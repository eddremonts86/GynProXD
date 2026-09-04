import { beforeAll, describe, expect, it } from 'vitest'
import source from '../../deploy/pocketbase/pb_hooks/utils/google_calendar.js?raw'

/**
 * The half of the Google connection worth testing, against the file PocketBase
 * loads rather than a copy of it, the way `coach-host.spec.ts` and
 * `nearby-events-server.spec.ts` do.
 *
 * What matters here is that an event which does not block time must not become
 * a block: a declined invitation, a birthday, an hour the calendar itself marks
 * free. Getting that wrong empties somebody's day and they never find out why.
 * The signed state that guards the callback moved to `oauth-state.spec.ts` with
 * the code, when Microsoft became the second provider to need it.
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
  authorizeUrl: (base: string, id: string, redirect: string, state: string) => string
  codeExchangeBody: (code: string, id: string, secret: string, redirect: string) => string
  refreshBody: (token: string, id: string, secret: string) => string
  eventsUrl: (base: string, nowMs: number) => string
  blockFrom: (event: unknown) => Block | null
  busyFrom: (json: unknown) => Block[]
  WATCH_TTL_S: number
  RENEW_MARGIN_MS: number
  watchUrl: (base: string) => string
  watchBody: (channel: string, address: string, token: string, ttl?: number) => string
  stopUrl: (base: string) => string
  stopBody: (channel: string, resource: string) => string
  channelExpiry: (json: unknown, nowMs: number, ttl?: number) => number
  renewDue: (channel: unknown, expiresAt: unknown, nowMs: number) => boolean
}

const shipped = { exports: {} as Shipped }
let google: Shipped

beforeAll(() => {
  new Function('module', 'exports', source)(shipped, shipped.exports)
  google = shipped.exports
})

describe('the URLs', () => {
  it('asks for read-only events, offline, with consent forced', () => {
    const url = google.authorizeUrl('https://accounts.google.com/', 'id.apps', 'https://x/cb', 's&t')
    expect(url.startsWith('https://accounts.google.com/o/oauth2/v2/auth?')).toBe(true)
    expect(url).toContain('scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fcalendar.events.readonly')
    expect(google.SCOPE.endsWith('calendar.events.readonly')).toBe(true)
    expect(url).toContain('access_type=offline')
    expect(url).toContain('prompt=consent')
    expect(url).toContain('state=s%26t')
    /* Nothing that could write. */
    expect(url).not.toContain('calendar.events%20')
  })

  it('sends the client secret only in a POST body, never in a URL', () => {
    const body = google.codeExchangeBody('the-code', 'id.apps', 'shh', 'https://x/cb')
    expect(body).toContain('grant_type=authorization_code')
    expect(body).toContain('client_secret=shh')
    expect(body).toContain('code=the-code')
    expect(google.refreshBody('r-token', 'id.apps', 'shh')).toContain('grant_type=refresh_token')
  })

  it('reads three weeks of expanded occurrences, in order', () => {
    const url = google.eventsUrl('https://www.googleapis.com', Date.UTC(2026, 8, 4, 12, 0, 0))
    expect(url).toContain('/calendar/v3/calendars/primary/events?')
    expect(url).toContain('timeMin=2026-09-04T12%3A00%3A00Z')
    expect(url).toContain('timeMax=2026-09-25T12%3A00%3A00Z')
    expect(url).toContain('singleEvents=true')
    expect(url).toContain('showDeleted=false')
    expect(google.DAYS_AHEAD).toBe(21)
  })
})

describe('blockFrom', () => {
  const meeting = {
    summary: 'Standup',
    status: 'confirmed',
    start: { dateTime: '2026-09-04T09:30:00+02:00' },
    end: { dateTime: '2026-09-04T10:00:00+02:00' },
  }

  it('reads the wall clock of the zone the event names', () => {
    expect(google.blockFrom(meeting)).toEqual({
      date: '2026-09-04',
      start: '09:30',
      end: '10:00',
      title: 'Standup',
    })
  })

  it('reads a Z time as written rather than shifting it', () => {
    expect(
      google.blockFrom({
        ...meeting,
        start: { dateTime: '2026-09-04T09:30:00Z' },
        end: { dateTime: '2026-09-04T10:00:00Z' },
      })?.start,
    ).toBe('09:30')
  })

  it('takes nothing that does not block time', () => {
    expect(google.blockFrom({ ...meeting, status: 'cancelled' })).toBeNull()
    expect(google.blockFrom({ ...meeting, transparency: 'transparent' })).toBeNull()
    /* An all-day event arrives as a date with no time. */
    expect(
      google.blockFrom({ ...meeting, start: { date: '2026-09-04' }, end: { date: '2026-09-05' } }),
    ).toBeNull()
  })

  it('takes nothing this person declined, and keeps what somebody else declined', () => {
    expect(
      google.blockFrom({
        ...meeting,
        attendees: [{ self: true, responseStatus: 'declined' }],
      }),
    ).toBeNull()
    expect(
      google.blockFrom({
        ...meeting,
        attendees: [{ email: 'other@x', responseStatus: 'declined' }],
      })?.start,
    ).toBe('09:30')
  })

  it('clips an event that runs past midnight to the day it starts on', () => {
    expect(
      google.blockFrom({
        ...meeting,
        start: { dateTime: '2026-09-04T22:00:00+02:00' },
        end: { dateTime: '2026-09-05T02:00:00+02:00' },
      }),
    ).toEqual({ date: '2026-09-04', start: '22:00', end: '23:59', title: 'Standup' })
  })

  it('refuses one that ends before it starts, and one with no times at all', () => {
    expect(
      google.blockFrom({
        ...meeting,
        end: { dateTime: '2026-09-04T09:00:00+02:00' },
      }),
    ).toBeNull()
    expect(google.blockFrom({ summary: 'Nothing' })).toBeNull()
    expect(google.blockFrom(null)).toBeNull()
  })
})

describe('busyFrom', () => {
  it('keeps what blocks time, in order, and survives nonsense', () => {
    const out = google.busyFrom({
      items: [
        {
          summary: 'Late',
          start: { dateTime: '2026-09-05T18:00:00Z' },
          end: { dateTime: '2026-09-05T19:00:00Z' },
        },
        { summary: 'Birthday', start: { date: '2026-09-04' }, end: { date: '2026-09-05' } },
        {
          summary: 'Early',
          start: { dateTime: '2026-09-04T08:00:00Z' },
          end: { dateTime: '2026-09-04T09:00:00Z' },
        },
      ],
    })
    expect(out.map((b) => b.title)).toEqual(['Early', 'Late'])
    expect(google.busyFrom(null)).toEqual([])
    expect(google.busyFrom({ items: 'soon' })).toEqual([])
  })
})

/**
 * The push channel, which is the half that fails quietly.
 *
 * A wrong `renewDue` is the expensive one: too eager and every member's channel
 * is replaced hourly for nothing, too shy and channels lapse and the calendar
 * stops telling anybody anything with no error anywhere to notice.
 */
describe('the watch channel', () => {
  it('asks for a web hook at our address, carrying the signed token', () => {
    const body = JSON.parse(google.watchBody('chan-1', 'https://enforma.test/notify', 'u.1.mac'))
    expect(body).toEqual({
      id: 'chan-1',
      type: 'web_hook',
      address: 'https://enforma.test/notify',
      token: 'u.1.mac',
      params: { ttl: String(google.WATCH_TTL_S) },
    })
    expect(google.watchUrl('https://www.googleapis.com/')).toBe(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events/watch',
    )
  })

  it('closes a channel with both ids, because ours alone will not do it', () => {
    expect(JSON.parse(google.stopBody('chan-1', 'res-9'))).toEqual({ id: 'chan-1', resourceId: 'res-9' })
    expect(google.stopUrl('https://www.googleapis.com')).toBe(
      'https://www.googleapis.com/calendar/v3/channels/stop',
    )
  })

  it("takes Google's expiry when there is one, and assumes the asked-for TTL when not", () => {
    const now = 1_800_000_000_000
    expect(google.channelExpiry({ expiration: String(now + 60_000) }, now)).toBe(now + 60_000)
    /* Already gone, or unreadable: neither is a usable expiry. */
    expect(google.channelExpiry({ expiration: String(now - 1) }, now)).toBe(now + google.WATCH_TTL_S * 1000)
    expect(google.channelExpiry({ expiration: 'soon' }, now)).toBe(now + google.WATCH_TTL_S * 1000)
    expect(google.channelExpiry({}, now)).toBe(now + google.WATCH_TTL_S * 1000)
  })

  it('renews inside the margin, and leaves a channel with time on it alone', () => {
    const now = Date.parse('2026-09-04T00:00:00Z')
    const at = (ms: number) => new Date(now + ms).toISOString().replace('T', ' ').replace('Z', 'Z')
    expect(google.renewDue('chan', at(google.RENEW_MARGIN_MS + 60_000), now)).toBe(false)
    expect(google.renewDue('chan', at(google.RENEW_MARGIN_MS - 60_000), now)).toBe(true)
    expect(google.renewDue('chan', at(-60_000), now)).toBe(true)
  })

  it('treats a link with no channel, or one it cannot read, as due', () => {
    const now = Date.parse('2026-09-04T00:00:00Z')
    /* A connection made while the address was unset, or a watch that failed at
       connect time. The cron is the only thing that repairs either. */
    expect(google.renewDue('', '2030-01-01 00:00:00.000Z', now)).toBe(true)
    expect(google.renewDue(null, null, now)).toBe(true)
    expect(google.renewDue('chan', '', now)).toBe(true)
    expect(google.renewDue('chan', 'whenever', now)).toBe(true)
  })
})
