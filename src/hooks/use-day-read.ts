import { useState, useSyncExternalStore } from 'react'
import { activeProfile } from '@/lib/profiles'
import { serverCapabilities, subscribeCapabilities } from '@/lib/capabilities'
import { activeAuthHeader, readSyncLink } from '@/lib/sync'
import { where } from '@/lib/life-coach'
import {
  readDay,
  readSignature,
  recallRead,
  type CoachEndpoint,
  type DayRead,
  type ReadFailure,
} from '@/lib/day-read'
import type { DayPlan } from '@/lib/day-plan'
import type { LifeProfile } from '@/lib/life-profile'

/**
 * The reading of one day, held for as long as that day is the same day.
 *
 * State is keyed by the day's signature rather than reset in an effect: when an
 * anchor moves, the held state simply stops matching and the hook answers from
 * the session cache or with nothing, on the same render. No flash of a reading
 * about a day that no longer exists.
 */

export type ReadState =
  | { kind: 'idle' }
  | { kind: 'busy' }
  | { kind: 'done'; read: DayRead }
  | { kind: 'failed'; why: ReadFailure }

/**
 * Where the coach is asked. The build flag means the dev proxy carries the key
 * and the relative path is the one that works; otherwise the account's own
 * server, which is what `/api/enforma/me` and the capabilities probe already
 * talk to, and which holds the key in production.
 */
function coachEndpoint(): CoachEndpoint | null {
  const headers = activeAuthHeader()
  if (!headers) return null
  if (__AI_COACH__) return { url: '/api/minimax/chat/completions', headers }
  const id = activeProfile()?.id
  const link = id ? readSyncLink(id) : null
  if (!link) return null
  const base = link.server.trim().replace(/\/+$/, '') || '/pb'
  return { url: `${base}/api/minimax/chat/completions`, headers }
}

export function useDayRead(plan: DayPlan, profile: LifeProfile) {
  const signature = readSignature(plan, profile)
  const [held, setHeld] = useState<{ signature: string; state: ReadState } | null>(null)

  const state: ReadState =
    held && held.signature === signature
      ? held.state
      : (() => {
          const cached = recallRead(signature)
          return cached ? { kind: 'done', read: cached } : { kind: 'idle' }
        })()

  /* No useCallback: the compiler memoises, and a hand-written dependency list
     was the one thing it could not agree with. */
  const ask = async () => {
    const endpoint = coachEndpoint()
    if (!endpoint) {
      setHeld({ signature, state: { kind: 'failed', why: 'no-coach' } })
      return
    }
    setHeld({ signature, state: { kind: 'busy' } })
    const result = await readDay(plan, profile, endpoint)
    setHeld({
      signature,
      state: result.ok ? { kind: 'done', read: result.read } : { kind: 'failed', why: result.why },
    })
  }

  /* Subscribed so the offer appears when the server answers, not on the next
     unrelated render. `where()` stays the one source of the answer itself. */
  useSyncExternalStore(subscribeCapabilities, serverCapabilities, serverCapabilities)
  const destination = where()
  return { state, ask, offered: destination.coach, host: destination.host }
}
