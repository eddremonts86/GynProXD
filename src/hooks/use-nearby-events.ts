import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { serverCapabilities, subscribeCapabilities } from '@/lib/capabilities'
import { accountBase } from '@/lib/account-base'
import { activeAuthHeader } from '@/lib/sync'
import { geohash } from '@/lib/geohash'
import { fetchNearby, type NearbyEvent, type NearbyFailure } from '@/lib/nearby-events'
import type { LifeProfile } from '@/lib/life-profile'

/**
 * What is on near the place this profile remembers.
 *
 * The place lives on the profile (`profile.place`), so it survives a reload
 * and follows the account between devices, and so the strip never asks the
 * browser for a position twice. This hook asks the server whenever the place
 * changes and holds the answer keyed by it, the way `useDayRead` holds a
 * reading by the day's signature: a new place is a new question, and a stale
 * answer stops matching rather than flashing.
 *
 * The position is rounded to a five kilometre cell here, before anything is
 * stored or sent. Nothing finer exists past this line.
 */

export type NearbyState =
  | { kind: 'idle' }
  | { kind: 'locating' }
  | { kind: 'busy' }
  | { kind: 'done'; events: NearbyEvent[]; cached: boolean }
  | { kind: 'failed'; why: NearbyFailure | 'no-position' }

/** How long a position may have been sitting in the browser's cache. */
const POSITION_MAX_AGE_MS = 10 * 60 * 1000

export function useNearbyEvents(
  profile: LifeProfile,
  onProfile: (patch: Partial<Omit<LifeProfile, 'updatedAt'>>) => void,
) {
  const caps = useSyncExternalStore(subscribeCapabilities, serverCapabilities, serverCapabilities)
  const place = profile.place ?? null
  const geo = place?.geo ?? null
  const city = place?.city ?? null
  const key = geo ? `g:${geo}` : city ? `c:${city}` : ''

  const [held, setHeld] = useState<{ key: string; state: NearbyState } | null>(null)
  const [attempt, setAttempt] = useState(0)
  /* Which question is in flight. Only its own answer may land, so a place
     changed mid-request never shows the previous place's events. */
  const asked = useRef('')

  useEffect(() => {
    if (!key || !caps.events) return
    const mine = `${key}#${attempt}`
    if (asked.current === mine) return
    asked.current = mine
    void (async () => {
      const base = accountBase()
      const headers = activeAuthHeader()
      const result =
        base && headers
          ? await fetchNearby(base, headers, geo ? { geo } : { city: city ?? '' })
          : { ok: false as const, why: 'refused' as const }
      if (asked.current !== mine) return
      setHeld({
        key,
        state: result.ok
          ? { kind: 'done', events: result.events, cached: result.cached }
          : { kind: 'failed', why: result.why },
      })
    })()
  }, [key, geo, city, attempt, caps.events])

  const state: NearbyState =
    held && held.key === key ? held.state : key ? { kind: 'busy' } : { kind: 'idle' }

  const locate = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setHeld({ key: '', state: { kind: 'failed', why: 'no-position' } })
      return
    }
    setHeld({ key: '', state: { kind: 'locating' } })
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const cell = geohash(position.coords.latitude, position.coords.longitude)
        onProfile({ place: { geo: cell, label: 'Around you' } })
      },
      () => setHeld({ key: '', state: { kind: 'failed', why: 'no-position' } }),
      { timeout: 10_000, maximumAge: POSITION_MAX_AGE_MS },
    )
  }

  const lookAround = (typed: string) => {
    const label = typed.replace(/\s+/g, ' ').trim().slice(0, 60)
    if (label.length < 2) return
    onProfile({ place: { city: label.toLowerCase(), label } })
  }

  const forget = () => {
    setHeld(null)
    onProfile({ place: undefined })
  }

  const retry = () => setAttempt((n) => n + 1)

  return { state, place, offered: caps.events, locate, lookAround, forget, retry }
}
