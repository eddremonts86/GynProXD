import { useSyncExternalStore } from 'react'
import { registerSW } from 'virtual:pwa-register'

/**
 * Knowing that the installed app is a build behind, and doing something about
 * it.
 *
 * An installed PWA is the awkward case: the browser re-checks the worker
 * script on navigation, and a standalone window that is never fully closed
 * barely navigates, so a phone can sit on last week's build while the same
 * site in a browser tab is current. That is the gap this closes — we ask on a
 * timer and every time the app comes back to the foreground, which is the
 * moment someone opens it to train.
 *
 * The update is never applied behind the member's back. It waits until they
 * press the button, or until every tab is closed, whichever comes first.
 */

/** Often enough to catch a release the same day, rare enough to be free. */
const CHECK_EVERY_MS = 60 * 60 * 1000

let ready = false
let apply: (reload?: boolean) => Promise<void> = async () => {}
let started = false
const listeners = new Set<() => void>()

function announce(): void {
  for (const listener of listeners) listener()
}

/** Registers once per page load; later calls are ignored. */
export function watchForUpdates(): void {
  if (started) return
  started = true

  apply = registerSW({
    immediate: true,
    onNeedRefresh() {
      ready = true
      announce()
    },
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return

      const check = () => {
        /* Offline the request only fails noisily; the next check is soon. */
        if (navigator.onLine) void registration.update()
      }

      /* Both handlers live as long as the document does, which is why neither
         is torn down: there is no point in the app's life where it should stop
         noticing a new build. */
      window.setInterval(check, CHECK_EVERY_MS)
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check()
      })
      window.addEventListener('online', check)
    },
  })
}

/**
 * Swaps to the waiting worker and reloads onto the new build.
 *
 * The reload is ours rather than the plugin's: its own version hangs off a
 * `controlling` event whose `isUpdate` flag did not fire reliably here, and a
 * button that swaps the worker without reloading leaves the member staring at
 * the old build having been told it updated. So we wait for the swap itself —
 * `controllerchange` — and reload on that, with a short backstop in case the
 * event never lands.
 */
export function applyUpdate(): void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return

  let done = false
  const reload = () => {
    if (done) return
    done = true
    window.location.reload()
  }

  navigator.serviceWorker.addEventListener('controllerchange', reload, { once: true })
  window.setTimeout(reload, 3000)

  void apply(false)
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const isReady = () => ready

/** True once a newer build is installed and waiting to take over. */
export function useUpdateReady(): boolean {
  return useSyncExternalStore(subscribe, isReady, () => false)
}
