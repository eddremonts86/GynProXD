import { useSyncExternalStore } from 'react'

/**
 * Whether the desktop rail is folded away.
 *
 * The state lives outside React because two distant things read it — the rail
 * itself and the content column that has to reclaim its 240px — and a hook
 * with local state in each would let them disagree. It is remembered per
 * device: someone who folds it away wants it away tomorrow too.
 *
 * Only meaningful from `lg` up. Below that there is no rail: the app uses a
 * top bar and a bottom nav, and the toggle hides with it.
 */

const STORAGE_KEY = 'forma-rail-hidden'

function read(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'hidden'
  } catch {
    return false
  }
}

let hidden = typeof localStorage === 'undefined' ? false : read()
const listeners = new Set<() => void>()

function emit(): void {
  for (const listener of listeners) listener()
}

export function toggleRail(): void {
  hidden = !hidden
  try {
    localStorage.setItem(STORAGE_KEY, hidden ? 'hidden' : 'shown')
  } catch {
    // Private mode: the choice just does not survive a reload.
  }
  emit()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const snapshot = () => hidden

export function useRailHidden(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => false)
}
