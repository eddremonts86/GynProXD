import { useEffect, useState, useSyncExternalStore } from 'react'
import { serverCapabilities, subscribeCapabilities } from '@/lib/capabilities'
import {
  calendarConnectUrl,
  calendarStatuses,
  connectApple,
  disconnectCalendar,
  pullApple,
  pullCalendar,
  type CalendarFailure,
  type CalendarProvider,
  type CalendarStatus,
} from '@/lib/calendar-link'
import type { BusyBlock } from '@/lib/life-profile'

/**
 * The connected calendars, as one screen sees them.
 *
 * Two providers, one state each, and they are independent: a member may have
 * Google attached and iCloud not, or both, and a failure on one says nothing
 * about the other. The status of both is asked for once when the sheet opens
 * and after anything that could change either.
 *
 * A pull is never automatic on a timer. It costs a round trip through somebody
 * else's server on the member's behalf, and a day that silently rearranged
 * itself while they were reading it would be worse than one that is a refresh
 * out of date. `?calendar=connected` coming back from Google's consent screen
 * is the one moment a pull happens without being asked for, because that is
 * exactly what the member just said yes to.
 */

export type LinkState =
  | { kind: 'off' }
  | { kind: 'checking' }
  | { kind: 'disconnected' }
  | { kind: 'connected'; status: CalendarStatus; pulled: number | null }
  | { kind: 'working' }
  | { kind: 'failed'; why: CalendarFailure }

export interface ProviderLink {
  state: LinkState
  offered: boolean
  refresh: () => Promise<void>
  disconnect: () => Promise<void>
}

type States = Record<CalendarProvider, LinkState>

export function useCalendarLink(
  onBlocks: (blocks: readonly Omit<BusyBlock, 'id'>[], source: CalendarProvider) => number,
  /** True the moment the member lands back from Google having said yes. */
  justConnected: boolean,
) {
  const caps = useSyncExternalStore(subscribeCapabilities, serverCapabilities, serverCapabilities)
  const [states, setStates] = useState<States>({ google: { kind: 'checking' }, apple: { kind: 'checking' } })
  const [keepTitles, setKeepTitles] = useState(false)

  const put = (provider: CalendarProvider, state: LinkState) =>
    setStates((current) => ({ ...current, [provider]: state }))

  useEffect(() => {
    let alive = true
    void (async () => {
      const answer = await calendarStatuses()
      if (!alive) return
      for (const provider of ['google', 'apple'] as const) {
        if (!caps.calendars[provider]) {
          put(provider, { kind: 'off' })
          continue
        }
        const status = answer[provider]
        put(
          provider,
          status.connected ? { kind: 'connected', status, pulled: null } : { kind: 'disconnected' },
        )
      }
      /* The one automatic read. Google only: it is the return leg of a consent
         screen, and Apple has no round trip to come back from. */
      if (caps.calendars.google && answer.google.connected && justConnected) {
        put('google', { kind: 'working' })
        const result = await pullCalendar(false)
        if (!alive) return
        if (!result.ok) {
          put('google', { kind: 'failed', why: result.why })
          return
        }
        const pulled = onBlocks(result.blocks, 'google')
        const after = await calendarStatuses()
        if (!alive) return
        put('google', { kind: 'connected', status: after.google, pulled })
      }
    })()
    return () => {
      alive = false
    }
    /* `onBlocks` is a store action and stable; including it would re-run this
       on every render of the screen that owns it. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caps.calendars.google, caps.calendars.apple, justConnected])

  const refresh = async (provider: CalendarProvider) => {
    put(provider, { kind: 'working' })
    const result = provider === 'apple' ? await pullApple(keepTitles) : await pullCalendar(keepTitles)
    if (!result.ok) {
      put(provider, { kind: 'failed', why: result.why })
      return
    }
    const pulled = onBlocks(result.blocks, provider)
    const after = await calendarStatuses()
    put(provider, { kind: 'connected', status: after[provider], pulled })
  }

  const disconnect = async (provider: CalendarProvider) => {
    put(provider, { kind: 'working' })
    await disconnectCalendar(provider)
    /* The blocks it put there go with it: they are a mirror of something this
       device can no longer see, and leaving them would be a day shaped by a
       calendar nobody can check. */
    onBlocks([], provider)
    put(provider, { kind: 'disconnected' })
  }

  /** Google: out to the consent screen. Nothing is stored on the way. */
  const connectGoogle = async () => {
    put('google', { kind: 'working' })
    const answer = await calendarConnectUrl()
    if ('why' in answer) {
      put('google', { kind: 'failed', why: answer.why })
      return
    }
    window.location.assign(answer.url)
  }

  /**
   * Apple: the Apple ID and the app-specific password, verified before they are
   * stored, then read straight away. There is no consent screen to leave for,
   * so the first read happens here rather than on a return leg.
   */
  const connectAppleWith = async (appleId: string, password: string) => {
    put('apple', { kind: 'working' })
    const answer = await connectApple(appleId, password)
    if (!answer.ok) {
      put('apple', { kind: 'failed', why: answer.why })
      return
    }
    const result = await pullApple(keepTitles)
    if (!result.ok) {
      put('apple', { kind: 'failed', why: result.why })
      return
    }
    const pulled = onBlocks(result.blocks, 'apple')
    const after = await calendarStatuses()
    put('apple', { kind: 'connected', status: after.apple, pulled })
  }

  return {
    keepTitles,
    setKeepTitles,
    google: {
      state: states.google,
      offered: caps.calendars.google,
      connect: connectGoogle,
      refresh: () => refresh('google'),
      disconnect: () => disconnect('google'),
    },
    apple: {
      state: states.apple,
      offered: caps.calendars.apple,
      connect: connectAppleWith,
      refresh: () => refresh('apple'),
      disconnect: () => disconnect('apple'),
    },
    /** Whether the group is worth drawing at all. */
    offered: caps.calendars.google || caps.calendars.apple,
  }
}

export type CalendarLink = ReturnType<typeof useCalendarLink>
