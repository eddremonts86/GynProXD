import { beforeAll, describe, expect, it } from 'vitest'
import source from '../../deploy/pocketbase/pb_hooks/utils/google_calendar.js?raw'

/**
 * The half of the Google connection worth testing, against the file PocketBase
 * loads rather than a copy of it, the way `coach-host.spec.ts` and
 * `nearby-events-server.spec.ts` do.
 *
 * Two things matter here more than the rest. The signed state is the whole
 * identity check on a callback that arrives with no session, so a forged or
 * expired one has to be refused. And an event that does not block time must not
 * become a block: a declined invitation, a birthday, an hour the calendar
 * itself marks free. Getting that wrong empties somebody's day and they never
 * find out why.
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
  STATE_TTL_MS: number
  signState: (userId: string, expiresAtMs: number, secret: string) => string
  verifyState: (state: string, secret: string, nowMs: number) => string | null
  authorizeUrl: (base: string, id: string, redirect: string, state: string) => string
  codeExchangeBody: (code: string, id: string, secret: string, redirect: string) => string
  refreshBody: (token: string, id: string, secret: string) => string
  eventsUrl: (base: string, nowMs: number) => string
  blockFrom: (event: unknown) => Block | null
  busyFrom: (json: unknown) => Block[]
}

const shipped = { exports: {} as Shipped }
let google: Shipped

beforeAll(() => {
  /* `$security` is a runtime global in PocketBase. A stand-in with the same
     shape is enough here: what is under test is that the state is signed over
     the body and compared whole, not the strength of an HMAC Go already tests. */
  ;(globalThis as unknown as { $security: unknown }).$security = {
    /* No dots in the output: the state is three dot-separated parts, and a MAC
       carrying one would split into four and be rejected for the wrong reason. */
    hs256: (data: string, secret: string) =>
      `mac${data}with${secret}`.replace(/[^a-z0-9]/gi, ''),
    equal: (a: string, b: string) => a === b,
  }
  new Function('module', 'exports', source)(shipped, shipped.exports)
  google = shipped.exports
})

describe('the signed state', () => {
  const secret = 'x'.repeat(32)
  const now = Date.UTC(2026, 8, 4, 12, 0, 0)

  it('comes back as the account that started the flow', () => {
    const state = google.signState('user123', now + 60_000, secret)
    expect(google.verifyState(state, secret, now)).toBe('user123')
  })

  it('refuses one signed with another secret', () => {
    const state = google.signState('user123', now + 60_000, secret)
    expect(google.verifyState(state, 'y'.repeat(32), now)).toBeNull()
  })

  it('refuses one whose account was swapped after signing', () => {
    const state = google.signState('user123', now + 60_000, secret)
    const forged = state.replace('user123', 'someone-else')
    expect(google.verifyState(forged, secret, now)).toBeNull()
  })

  it('refuses one that has expired', () => {
    const state = google.signState('user123', now - 1, secret)
    expect(google.verifyState(state, secret, now)).toBeNull()
  })

  it('refuses nonsense rather than throwing', () => {
    expect(google.verifyState('', secret, now)).toBeNull()
    expect(google.verifyState('a.b', secret, now)).toBeNull()
    expect(google.verifyState('a.b.c.d', secret, now)).toBeNull()
  })

  it('is good for ten minutes, which is one trip through a consent screen', () => {
    expect(google.STATE_TTL_MS).toBe(10 * 60 * 1000)
  })
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
