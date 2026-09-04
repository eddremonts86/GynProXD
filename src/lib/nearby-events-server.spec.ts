import { describe, expect, it } from 'vitest'
import source from '../../deploy/pocketbase/pb_hooks/utils/events.js?raw'

/**
 * The server half of "what is on near you", tested against the file PocketBase
 * loads, the way `coach-host.spec.ts` does. What matters here is what leaves
 * and what comes back: the vendor sees a cell and never a coordinate, and the
 * client sees our shape and never the vendor's.
 */
interface Shipped {
  RADIUS_KM: number
  isGeohash: (v: unknown) => boolean
  windowFor: (now: number) => { from: string; to: string }
  ticketmasterUrl: (base: string, key: string, q: { geo?: string; city?: string }, w: { from: string; to: string }) => string
  cacheKeyFor: (q: { geo?: string; city?: string }) => string
  isFresh: (at: string, now: number) => boolean
  normaliseTicketmaster: (json: unknown, limit?: number) => { id: string; name: string; date: string; time: string | null; venue: string; city: string; segment: string; url: string }[]
}
const shipped = { exports: {} as Shipped }
new Function('module', 'exports', source)(shipped, shipped.exports)
const events = shipped.exports

const vendor = (list: unknown[]) => ({ _embedded: { events: list } })
const one = (over: Record<string, unknown> = {}) => ({
  id: 'tm-1',
  name: 'Fake Quartet',
  url: 'https://tickets.example/quartet',
  dates: { start: { localDate: '2026-09-03', localTime: '20:00:00' } },
  classifications: [{ segment: { name: 'Music' } }],
  _embedded: { venues: [{ name: 'The Old Hall', city: { name: 'Barcelona' } }] },
  ...over,
})

describe('isGeohash', () => {
  it('takes a cell of four to seven characters from the geohash alphabet', () => {
    expect(events.isGeohash('ezs42')).toBe(true)
    expect(events.isGeohash('u4pruyd')).toBe(true)
    expect(events.isGeohash('ezs')).toBe(false)
    expect(events.isGeohash('ezs42a')).toBe(false)
    expect(events.isGeohash('41.39,2.17')).toBe(false)
    expect(events.isGeohash(undefined)).toBe(false)
  })
})

describe('ticketmasterUrl', () => {
  const window = events.windowFor(Date.UTC(2026, 8, 3, 12, 0, 0))

  it('sends the cell and a radius, never a coordinate', () => {
    const url = events.ticketmasterUrl('https://app.ticketmaster.com/discovery/v2/', 'k', { geo: 'ezs42' }, window)
    expect(url.startsWith('https://app.ticketmaster.com/discovery/v2/events.json?')).toBe(true)
    expect(url).toContain('geoPoint=ezs42')
    expect(url).toContain(`radius=${events.RADIUS_KM}`)
    expect(url).toContain('unit=km')
    expect(url).not.toMatch(/lat|lng|latlong/)
  })

  it('sends a city as a city', () => {
    const url = events.ticketmasterUrl('https://x', 'k', { city: 'lisboa' }, window)
    expect(url).toContain('city=lisboa')
    expect(url).not.toContain('geoPoint')
  })

  it('asks for a fortnight in the format the vendor insists on', () => {
    expect(window.from).toBe('2026-09-03T12:00:00Z')
    expect(window.to).toBe('2026-09-17T12:00:00Z')
  })
})

describe('the cache', () => {
  it('keys by cell or by city, apart', () => {
    expect(events.cacheKeyFor({ geo: 'ezs42' })).toBe('tm:v1:g:ezs42')
    expect(events.cacheKeyFor({ city: 'lisboa' })).toBe('tm:v1:c:lisboa')
  })

  it('is fresh for six hours and stale after, or when the stamp is nonsense', () => {
    const now = Date.UTC(2026, 8, 3, 12, 0, 0)
    expect(events.isFresh(new Date(now - 5 * 3600_000).toISOString(), now)).toBe(true)
    expect(events.isFresh(new Date(now - 7 * 3600_000).toISOString(), now)).toBe(false)
    expect(events.isFresh('yesterday', now)).toBe(false)
  })
})

describe('normaliseTicketmaster', () => {
  it('reduces the vendor shape to ours', () => {
    expect(events.normaliseTicketmaster(vendor([one()]))).toEqual([
      {
        id: 'tm-1',
        name: 'Fake Quartet',
        date: '2026-09-03',
        time: '20:00',
        venue: 'The Old Hall',
        city: 'Barcelona',
        segment: 'Music',
        url: 'https://tickets.example/quartet',
      },
    ])
  })

  it('keeps a day with no hour, drops one with no date, and drops a link that is not https', () => {
    const out = events.normaliseTicketmaster(
      vendor([
        one({ id: 'a', dates: { start: { localDate: '2026-09-05' } } }),
        one({ id: 'b', dates: { start: {} } }),
        one({ id: 'c', url: 'http://insecure.example' }),
      ]),
    )
    expect(out.map((e) => e.id)).toEqual(['c', 'a'])
    expect(out[1].time).toBeNull()
    expect(out[0].url).toBe('')
  })

  it('sorts by when and stops at the limit', () => {
    const out = events.normaliseTicketmaster(
      vendor([
        one({ id: 'late', dates: { start: { localDate: '2026-09-09', localTime: '10:00:00' } } }),
        one({ id: 'early', dates: { start: { localDate: '2026-09-03', localTime: '09:00:00' } } }),
        one({ id: 'mid', dates: { start: { localDate: '2026-09-03', localTime: '21:00:00' } } }),
      ]),
      2,
    )
    expect(out.map((e) => e.id)).toEqual(['early', 'mid'])
  })

  it('answers an empty list to nonsense rather than throwing', () => {
    expect(events.normaliseTicketmaster(null)).toEqual([])
    expect(events.normaliseTicketmaster({ _embedded: { events: 'soon' } })).toEqual([])
  })
})
