import { clockOf, minutesOf, MAX_OUTINGS, type Outing } from './life-profile'

/**
 * What is on near somebody, and what they decided to go to.
 *
 * The server does the fetching and the caching (`events.pb.js`); this side
 * asks it with a cell or a city, checks the answer's shape, and turns the one
 * a member taps into an `Outing` on their profile. An outing is a commitment in
 * the day planner's sense: an hour they said they would be somewhere, drawn as
 * an event, never moved to make room for a session.
 *
 * Ticketed events only, because that is what the source has. The strip says
 * so, and nothing here pretends a quiet Tuesday is empty because nobody sold a
 * ticket for it.
 */

export interface NearbyEvent {
  id: string
  name: string
  /** yyyy-mm-dd, the venue's local date. */
  date: string
  /** HH:MM, or null when the vendor gave a day and no hour. */
  time: string | null
  venue: string
  city: string
  segment: string
  /** https only, or empty. */
  url: string
}

export type NearbyQuery = { geo: string } | { city: string }
export type NearbyFailure = 'no-source' | 'refused' | 'unreachable' | 'unreadable'
export type NearbyResult =
  | { ok: true; events: NearbyEvent[]; cached: boolean }
  | { ok: false; why: NearbyFailure }

/**
 * How long a ticketed event is assumed to run.
 *
 * The vendor gives a start and no end. Two hours is a concert, a match or a
 * play, which is most of what gets a ticket; a gym class in `local-events.ts`
 * assumes one. The member who added it knows better and the day shows the
 * assumption plainly as an end time they can see.
 */
export const OUTING_MINUTES = 120

const REQUEST_TIMEOUT_MS = 20_000

function textOf(value: unknown, max: number): string {
  return typeof value === 'string' ? value.slice(0, max) : ''
}

/** The shape the server promised, checked rather than trusted. Exported for its tests. */
export function validateEvents(raw: unknown): NearbyEvent[] | null {
  const body = raw as { events?: unknown } | null
  if (!body || !Array.isArray(body.events)) return null
  const out: NearbyEvent[] = []
  for (const entry of body.events.slice(0, 40)) {
    const item = entry as Record<string, unknown> | null
    if (!item || typeof item.id !== 'string' || typeof item.name !== 'string') continue
    if (typeof item.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(item.date)) continue
    const time = typeof item.time === 'string' && /^\d\d:\d\d$/.test(item.time) ? item.time : null
    const url = typeof item.url === 'string' && /^https:\/\//.test(item.url) ? item.url : ''
    out.push({
      id: item.id,
      name: textOf(item.name, 80),
      date: item.date,
      time,
      venue: textOf(item.venue, 60),
      city: textOf(item.city, 40),
      segment: textOf(item.segment, 30),
      url,
    })
  }
  return out
}

export async function fetchNearby(
  base: string,
  headers: Record<string, string>,
  query: NearbyQuery,
): Promise<NearbyResult> {
  const param =
    'geo' in query
      ? `geo=${encodeURIComponent(query.geo)}`
      : `city=${encodeURIComponent(query.city)}`
  try {
    const res = await fetch(`${base}/api/enforma/events/near?${param}`, {
      headers,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    if (res.status === 503) return { ok: false, why: 'no-source' }
    if (res.status === 401 || res.status === 403) return { ok: false, why: 'refused' }
    if (!res.ok) return { ok: false, why: 'unreachable' }
    const body = (await res.json()) as { cached?: unknown }
    const events = validateEvents(body)
    if (!events) return { ok: false, why: 'unreadable' }
    return { ok: true, events, cached: body.cached === true }
  } catch {
    return { ok: false, why: 'unreachable' }
  }
}

/** The outing a tapped event becomes, or null when it has no hour to be placed at. */
export function outingFrom(event: NearbyEvent): Outing | null {
  const start = event.time === null ? null : minutesOf(event.time)
  if (start === null) return null
  const end = Math.min(start + OUTING_MINUTES, 24 * 60 - 1)
  if (end <= start) return null
  return {
    id: event.id,
    label: event.name,
    date: event.date,
    start: clockOf(start),
    end: clockOf(end),
    ...(event.venue ? { venue: event.venue } : {}),
    ...(event.url ? { url: event.url } : {}),
  }
}

/**
 * The list with one more on it. Past outings are dropped on the way, the same
 * event is never held twice, and the list stays bounded from the far end.
 */
export function withOuting(list: readonly Outing[], outing: Outing, today: string): Outing[] {
  const kept = list.filter((o) => o.date >= today && o.id !== outing.id)
  kept.push(outing)
  kept.sort((a, b) => `${a.date}${a.start}`.localeCompare(`${b.date}${b.start}`))
  return kept.slice(0, MAX_OUTINGS)
}

/** What the day planner reads: the outings on one date, as commitments. */
export function outingsOn(
  list: readonly Outing[],
  date: string,
): { label: string; start: string; end: string; ref: string; url?: string }[] {
  return list
    .filter((o) => o.date === date)
    .sort((a, b) => a.start.localeCompare(b.start))
    .map((o) => ({
      label: o.label,
      start: o.start,
      end: o.end,
      ref: o.id,
      ...(o.url ? { url: o.url } : {}),
    }))
}
