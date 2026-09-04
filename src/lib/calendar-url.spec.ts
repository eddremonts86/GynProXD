import { beforeAll, describe, expect, it } from 'vitest'
import source from '../../deploy/pocketbase/pb_hooks/utils/calendar_url.js?raw'

/**
 * The published-calendar address, against the shipped file.
 *
 * The refusals are the reason this has its own spec. A server that fetches an
 * address a signed-in member chose is a door onto everything the server can
 * reach and the caller cannot — a cloud metadata endpoint, another container on
 * the same network, an admin panel bound to loopback. Getting that wrong is not
 * a broken feature, it is a hole, so the cases live here rather than being
 * argued about in a handler.
 */
interface Shipped {
  MAX_BYTES: number
  normalizeUrl: (raw: unknown, hostKind: (u: string) => string, allowLocal?: boolean) => string
  looksLikeCalendar: (text: unknown) => boolean
  calendarName: (text: unknown) => string
  hostLabel: (url: unknown) => string
}

const shipped = { exports: {} as Shipped }
let lib: Shipped

/** The classifier the server passes in: `utils/coach_host.js`, in miniature. */
const kind = (url: string) => {
  const host = String(url).replace(/^[a-z]+:\/\//i, '').split('/')[0].split(':')[0].toLowerCase()
  const ours =
    host === 'localhost' ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    /\.(local|internal)$/.test(host) ||
    host.indexOf('.') === -1
  return ours ? 'self' : 'external'
}

beforeAll(() => {
  new Function('module', 'exports', source)(shipped, shipped.exports)
  lib = shipped.exports
})

describe('the address', () => {
  it('takes the webcal link a provider hands out, as handed out', () => {
    /* Every publisher gives `webcal://`, and no client has ever spoken a
       "webcal" protocol — it is https wearing a hat. Refusing it would mean
       telling people to edit the thing they just copied. */
    expect(lib.normalizeUrl('webcal://p01-calendars.icloud.com/published/2/abc', kind)).toBe(
      'https://p01-calendars.icloud.com/published/2/abc',
    )
    expect(lib.normalizeUrl('WEBCAL://example.com/a.ics', kind)).toBe('https://example.com/a.ics')
    expect(lib.normalizeUrl('  https://example.com/a.ics  ', kind)).toBe('https://example.com/a.ics')
  })

  it('refuses everything that is not a public https address', () => {
    for (const bad of [
      '',
      '   ',
      'example.com/a.ics',
      'ftp://example.com/a.ics',
      'file:///etc/passwd',
      'javascript:alert(1)',
      'data:text/calendar,BEGIN:VCALENDAR',
      /* Credentials in the address go to whatever the host turns out to be. */
      'https://user:pass@example.com/a.ics',
      /* Plain http would put the whole calendar on the wire in the clear. */
      'http://example.com/a.ics',
    ]) {
      expect(lib.normalizeUrl(bad, kind), bad).toBe('')
    }
  })

  it('refuses our own network, which is the one that would be a hole', () => {
    for (const bad of [
      'https://127.0.0.1/a.ics',
      'https://localhost/a.ics',
      'webcal://localhost:8090/a.ics',
      'https://10.0.0.5/a.ics',
      'https://192.168.1.1/a.ics',
      'https://172.16.0.9/a.ics',
      'https://169.254.169.254/latest/meta-data/',
      'https://pocketbase/a.ics',
      'https://thing.internal/a.ics',
      'https://box.local/a.ics',
    ]) {
      expect(lib.normalizeUrl(bad, kind), bad).toBe('')
    }
  })

  it('allows a local address only when a server has explicitly said so', () => {
    /* The walks serve a fake published calendar on loopback and could not be
       written otherwise. Production must never set it. */
    expect(lib.normalizeUrl('http://127.0.0.1:9/a.ics', kind, true)).toBe('http://127.0.0.1:9/a.ics')
    expect(lib.normalizeUrl('http://127.0.0.1:9/a.ics', kind, false)).toBe('')
    expect(lib.normalizeUrl('http://localhost:9/a.ics', kind, true)).toBe('http://localhost:9/a.ics')
  })

  it('and that permission reaches loopback only, not the rest of the network', () => {
    /* It was a blanket allow for one commit, and with it set the cloud metadata
       endpoint was accepted and actually fetched. A flag for a test harness
       must not widen the hole it stands next to. */
    for (const bad of [
      'https://169.254.169.254/latest/meta-data/',
      'https://10.0.0.5/a.ics',
      'https://192.168.1.1/a.ics',
      'https://172.16.0.9/a.ics',
      'https://[fd00::1]/a.ics',
      'https://pocketbase/a.ics',
      'https://box.local/a.ics',
      'http://example.com/a.ics',
    ]) {
      expect(lib.normalizeUrl(bad, kind, true), bad).toBe('')
    }
  })

  it('refuses an address longer than any real one', () => {
    expect(lib.normalizeUrl('https://example.com/' + 'a'.repeat(2100), kind)).toBe('')
  })
})

describe('what came back', () => {
  it('knows an iCalendar from a web page', () => {
    expect(lib.looksLikeCalendar('BEGIN:VCALENDAR\r\nEND:VCALENDAR')).toBe(true)
    expect(lib.looksLikeCalendar('<!doctype html><title>Calendar</title>')).toBe(false)
    expect(lib.looksLikeCalendar('')).toBe(false)
  })

  it('reads the name the calendar gives itself, unfolded', () => {
    expect(lib.calendarName('BEGIN:VCALENDAR\r\nX-WR-CALNAME:Trabajo\r\n')).toBe('Trabajo')
    /* iCalendar wraps at 75 octets by continuing on a line that starts with a
       space, so a long name arrives in pieces. */
    expect(lib.calendarName('X-WR-CALNAME:Work and\r\n  everything else\r\n')).toBe(
      'Work and everything else',
    )
    expect(lib.calendarName('X-WR-CALNAME;LANGUAGE=en:Home\r\n')).toBe('Home')
    expect(lib.calendarName('BEGIN:VCALENDAR\r\n')).toBe('')
  })

  it('shows the host back and never the path, which is the credential', () => {
    expect(lib.hostLabel('https://p01-calendars.icloud.com/published/2/SECRETTOKEN')).toBe(
      'p01-calendars.icloud.com',
    )
    expect(lib.hostLabel('https://[2001:db8::1]:8443/a.ics')).toBe('2001:db8::1')
  })
})
