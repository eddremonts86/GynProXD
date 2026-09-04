import { useEffect, useState, useSyncExternalStore } from 'react'
import { serverCapabilities, subscribeCapabilities } from '@/lib/capabilities'
import {
  calendarConnectUrl,
  calendarStatus,
  disconnectCalendar,
  pullCalendar,
  type CalendarFailure,
  type CalendarStatus,
} from '@/lib/calendar-link'
import type { BusyBlock } from '@/lib/life-profile'

/**
 * The connected calendar, as one screen sees it.
 *
 * The status is asked for once when the sheet opens and after anything that
 * could change it. A pull is never automatic on a timer: it costs a round trip
 * through Google on the member's behalf, and a day that silently rearranged
 * itself while somebody was reading it would be worse than one that is a
 * refresh out of date. `?calendar=connected` coming back from the consent
 * screen is the one moment a pull happens without being asked for, because
 * that is what the member just said yes to.
 */

export type LinkState =
  | { kind: 'off' }
  | { kind: 'checking' }
  | { kind: 'disconnected' }
  | { kind: 'connected'; status: CalendarStatus; pulled: number | null }
  | { kind: 'working' }
  | { kind: 'failed'; why: CalendarFailure }

export function useCalendarLink(
  onBlocks: (blocks: readonly Omit<BusyBlock, 'id'>[]) => number,
  /** True the moment the member lands back from Google having said yes. */
  justConnected: boolean,
) {
  const caps = useSyncExternalStore(subscribeCapabilities, serverCapabilities, serverCapabilities)
  const [state, setState] = useState<LinkState>({ kind: 'checking' })
  const [keepTitles, setKeepTitles] = useState(false)

  useEffect(() => {
    if (!caps.calendars) {
      setState({ kind: 'off' })
      return
    }
    let alive = true
    void (async () => {
      const status = await calendarStatus()
      if (!alive) return
      setState(
        status.connected
          ? { kind: 'connected', status, pulled: null }
          : { kind: 'disconnected' },
      )
      if (status.connected && justConnected) {
        setState({ kind: 'working' })
        const result = await pullCalendar(false)
        if (!alive) return
        setState(
          result.ok
            ? { kind: 'connected', status, pulled: onBlocks(result.blocks) }
            : { kind: 'failed', why: result.why },
        )
      }
    })()
    return () => {
      alive = false
    }
    /* `onBlocks` is a store action and stable; including it would re-run this
       on every render of the screen that owns it. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caps.calendars, justConnected])

  const connect = async () => {
    setState({ kind: 'working' })
    const answer = await calendarConnectUrl()
    if ('why' in answer) {
      setState({ kind: 'failed', why: answer.why })
      return
    }
    window.location.assign(answer.url)
  }

  const refresh = async () => {
    setState({ kind: 'working' })
    const result = await pullCalendar(keepTitles)
    if (!result.ok) {
      setState({ kind: 'failed', why: result.why })
      return
    }
    const pulled = onBlocks(result.blocks)
    setState({ kind: 'connected', status: await calendarStatus(), pulled })
  }

  const disconnect = async () => {
    setState({ kind: 'working' })
    await disconnectCalendar()
    /* The blocks it put there go with it: they are a mirror of something this
       device can no longer see, and leaving them would be a day shaped by a
       calendar nobody can check. */
    onBlocks([])
    setState({ kind: 'disconnected' })
  }

  return { state, offered: caps.calendars, keepTitles, setKeepTitles, connect, refresh, disconnect }
}
