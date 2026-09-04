import { useEffect, useState, useSyncExternalStore } from 'react'
import { serverCapabilities, subscribeCapabilities } from '@/lib/capabilities'
import {
  calendarConnectUrl,
  calendarStatuses,
  connectApple,
  connectCalendarUrl,
  disconnectCalendar,
  keepTitlesStored,
  pullApple,
  pullCalendar,
  pullMicrosoft,
  pullUrl,
  setKeepTitlesStored,
  type CalendarFailure,
  type CalendarProvider,
  type CalendarStatus,
} from '@/lib/calendar-link'
import type { BusyBlock } from '@/lib/life-profile'

/**
 * The connected calendars, as one screen sees them.
 *
 * Three providers, one state each, and they are independent: a member may have
 * Google attached and iCloud not, or all three, and a failure on one says
 * nothing about the others. The status of each is asked for once when the sheet
 * opens and after anything that could change any of them.
 *
 * A pull is never automatic on a timer. It costs a round trip through somebody
 * else's server on the member's behalf, and a day that silently rearranged
 * itself while they were reading it would be worse than one that is a refresh
 * out of date. Two moments are not timers, and both read without being asked:
 *
 *   `?calendar=connected` coming back from a consent screen, because that is
 *   exactly what the member just said yes to. Which provider it came back from
 *   is not in the URL, so whichever ones report connected and have nothing read
 *   yet are the ones read: that is the same set, and it makes the return leg
 *   work for both without a second query parameter to keep honest.
 *
 *   A provider reporting `changed` — Google, on a server holding a watch
 *   channel, having been told by Google that the calendar moved. It is news
 *   rather than a schedule: nothing is fetched unless something actually
 *   changed, and it is read as this screen opens rather than under somebody
 *   already looking at it. That is the whole of what the push buys, and it is
 *   why the notification carries no events — see `calendar.pb.js`.
 */

export type LinkState =
  | { kind: 'off' }
  | { kind: 'checking' }
  | { kind: 'disconnected' }
  | { kind: 'connected'; status: CalendarStatus; pulled: number | null }
  | { kind: 'working' }
  /**
   * A read that did not get through.
   *
   * `status` is what the provider was before it failed, and it is here because
   * without it the panel falls back to its connect form: a member whose
   * calendar failed to read would lose the two buttons that matter — read it
   * again, and disconnect — and the only way back would be re-entering a
   * credential the server still holds. It is absent for a *connection* that
   * failed, where there is nothing behind it and the form is the right answer.
   */
  | { kind: 'failed'; why: CalendarFailure; status?: CalendarStatus }

export interface ProviderLink {
  state: LinkState
  offered: boolean
  refresh: () => Promise<void>
  disconnect: () => Promise<void>
}

type States = Record<CalendarProvider, LinkState>

const PROVIDERS: readonly CalendarProvider[] = ['google', 'apple', 'microsoft', 'url']

export function useCalendarLink(
  onBlocks: (blocks: readonly Omit<BusyBlock, 'id'>[], source: CalendarProvider) => number,
  /** True the moment the member lands back from Google having said yes. */
  justConnected: boolean,
) {
  const caps = useSyncExternalStore(subscribeCapabilities, serverCapabilities, serverCapabilities)
  const [states, setStates] = useState<States>({
    google: { kind: 'checking' },
    apple: { kind: 'checking' },
    microsoft: { kind: 'checking' },
    url: { kind: 'checking' },
  })
  const [keepTitles, setKeepTitlesState] = useState(keepTitlesStored)
  const setKeepTitles = (keep: boolean) => {
    setKeepTitlesStored(keep)
    setKeepTitlesState(keep)
  }

  const put = (provider: CalendarProvider, state: LinkState) =>
    setStates((current) => ({ ...current, [provider]: state }))

  useEffect(() => {
    let alive = true
    void (async () => {
      const answer = await calendarStatuses()
      if (!alive) return
      if (!answer) {
        /* Could not ask. Nothing is claimed and nothing is dropped: the blocks
           on the day stay exactly as they are until somebody can be asked. */
        for (const provider of PROVIDERS) {
          put(provider, caps.calendars[provider] ? { kind: 'failed', why: 'unreachable' } : { kind: 'off' })
        }
        return
      }
      for (const provider of PROVIDERS) {
        if (!caps.calendars[provider]) {
          put(provider, { kind: 'off' })
          continue
        }
        const status = answer[provider]
        put(
          provider,
          status.connected ? { kind: 'connected', status, pulled: null } : { kind: 'disconnected' },
        )
        /**
         * A provider the account is not connected to keeps no blocks on the
         * day. They are a mirror of a calendar nobody can check any more, and
         * a disconnect made elsewhere — another device, a password revoked in
         * Apple's own settings, an account restored from a backup — has to
         * reach this device too. Only ever on a real answer, never on a
         * failure to ask.
         */
        if (!status.connected) onBlocks([], provider)
      }
      /* The automatic reads. Apple has no round trip to come back from and no
         way to be pushed to, so it is never in this set. */
      const unasked = (['google', 'microsoft'] as const).filter(
        (provider) =>
          caps.calendars[provider] &&
          answer[provider].connected &&
          (justConnected || answer[provider].changed !== null),
      )
      if (unasked.length > 0) {
        for (const provider of unasked) {
          put(provider, { kind: 'working' })
          const result = provider === 'microsoft' ? await pullMicrosoft(false) : await pullCalendar(false)
          if (!alive) return
          if (!result.ok) {
            put(provider, { kind: 'failed', why: result.why, status: answer[provider] })
            continue
          }
          const pulled = onBlocks(result.blocks, provider)
          const after = await calendarStatuses()
          if (!alive) return
          put(provider, {
            kind: 'connected',
            status: after?.[provider] ?? { connected: true, account: '', lastSynced: null, changed: null },
            pulled,
          })
        }
      }
    })()
    return () => {
      alive = false
    }
    /* `onBlocks` is a store action and stable; including it would re-run this
       on every render of the screen that owns it. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caps.calendars.google, caps.calendars.apple, caps.calendars.microsoft, caps.calendars.url, justConnected])

  const refresh = async (provider: CalendarProvider) => {
    /* Captured before `working` erases it: a failure below has to hand the
       panel back something to keep its controls for. */
    const before = states[provider]
    const held =
      before.kind === 'connected' ? before.status : before.kind === 'failed' ? before.status : undefined
    put(provider, { kind: 'working' })
    const result =
      provider === 'apple'
        ? await pullApple(keepTitles)
        : provider === 'microsoft'
          ? await pullMicrosoft(keepTitles)
          : provider === 'url'
            ? await pullUrl(keepTitles)
            : await pullCalendar(keepTitles)
    if (!result.ok) {
      put(provider, { kind: 'failed', why: result.why, ...(held ? { status: held } : {}) })
      return
    }
    const pulled = onBlocks(result.blocks, provider)
    const after = await calendarStatuses()
    put(provider, { kind: 'connected', status: after?.[provider] ?? { connected: true, account: '', lastSynced: null, changed: null }, pulled })
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

  /** Out to a consent screen. Nothing is stored on the way. */
  const connectVia = async (provider: 'google' | 'microsoft') => {
    put(provider, { kind: 'working' })
    const answer = await calendarConnectUrl(provider)
    if ('why' in answer) {
      put(provider, { kind: 'failed', why: answer.why })
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
    put('apple', {
      kind: 'connected',
      status: after?.apple ?? { connected: true, account: appleId, lastSynced: null, changed: null },
      pulled,
    })
  }

  /**
   * A published address, verified and read in one go.
   *
   * The same shape as Apple's connect: there is no consent screen to leave for,
   * so the first read happens here rather than on a return leg.
   */
  const subscribeTo = async (url: string) => {
    put('url', { kind: 'working' })
    const answer = await connectCalendarUrl(url)
    if (!answer.ok) {
      put('url', { kind: 'failed', why: answer.why })
      return
    }
    const result = await pullUrl(keepTitles)
    if (!result.ok) {
      put('url', { kind: 'failed', why: result.why })
      return
    }
    const pulled = onBlocks(result.blocks, 'url')
    const after = await calendarStatuses()
    put('url', {
      kind: 'connected',
      status: after?.url ?? { connected: true, account: answer.name, lastSynced: null, changed: null },
      pulled,
    })
  }

  return {
    keepTitles,
    setKeepTitles,
    google: {
      state: states.google,
      offered: caps.calendars.google,
      connect: () => connectVia('google'),
      refresh: () => refresh('google'),
      disconnect: () => disconnect('google'),
    },
    microsoft: {
      state: states.microsoft,
      offered: caps.calendars.microsoft,
      connect: () => connectVia('microsoft'),
      refresh: () => refresh('microsoft'),
      disconnect: () => disconnect('microsoft'),
    },
    apple: {
      state: states.apple,
      offered: caps.calendars.apple,
      connect: connectAppleWith,
      refresh: () => refresh('apple'),
      disconnect: () => disconnect('apple'),
    },
    url: {
      state: states.url,
      offered: caps.calendars.url,
      connect: subscribeTo,
      refresh: () => refresh('url'),
      disconnect: () => disconnect('url'),
    },
    /** Whether the group is worth drawing at all. */
    offered: PROVIDERS.some((provider) => caps.calendars[provider]),
  }
}

export type CalendarLink = ReturnType<typeof useCalendarLink>
