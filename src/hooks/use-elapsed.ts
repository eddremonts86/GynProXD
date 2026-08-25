import { useSyncExternalStore } from 'react'

/**
 * One shared second-tick for the whole app. Independent intervals drift apart by
 * up to a second, which is visible when the header clock and the rail clock are
 * on screen together. The store holds the timestamp so reads stay pure.
 */
let listeners: (() => void)[] = []
let timer: number | null = null
let now = Date.now()

function subscribe(onChange: () => void) {
  listeners.push(onChange)
  if (timer === null) {
    now = Date.now()
    timer = window.setInterval(() => {
      now = Date.now()
      for (const l of listeners) l()
    }, 1000)
  }
  return () => {
    listeners = listeners.filter((l) => l !== onChange)
    if (listeners.length === 0 && timer !== null) {
      window.clearInterval(timer)
      timer = null
    }
  }
}

const getSnapshot = () => now
const getServerSnapshot = () => 0

/**
 * Seconds since an ISO timestamp. Returns null when the timestamp is missing,
 * so callers can hide the readout for sessions recorded before durations were
 * tracked rather than showing a fabricated zero.
 */
export function useElapsedSeconds(startedAt: string | undefined | null): number | null {
  const tickedAt = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  if (!startedAt) return null
  const start = Date.parse(startedAt)
  if (Number.isNaN(start)) return null
  return Math.max(0, Math.floor((tickedAt - start) / 1000))
}
