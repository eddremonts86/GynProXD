import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { router } from './router'
import { watchForUpdates } from './lib/pwa-update'
import './index.css'

/* Outside React on purpose: a device that never gets past the lock screen
   still needs to be able to pick up a new build. */
watchForUpdates()

/**
 * One rejection that is not a fault, silenced by name.
 *
 * `defaultViewTransition` is on in the router, so every navigation starts one —
 * and a navigation that begins before the last transition has finished makes
 * the browser abort it. That abort arrives as an unhandled rejection nobody can
 * catch, because the promise belongs to the router, and it appears in devtools
 * as `InvalidStateError: Transition was aborted because of invalid state`.
 *
 * It is what somebody tapping twice looks like, and there is nothing to fix in
 * it. Left alone it costs more than it seems: it sat in this app's console
 * looking like a defect, was investigated as one, and any real error reporting
 * would have it drowning out the errors that matter.
 *
 * Matched on the name *and* the message, so an `InvalidStateError` from
 * anywhere else still reaches the console where it belongs.
 */
window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason as { name?: unknown; message?: unknown } | null
  if (
    reason &&
    reason.name === 'InvalidStateError' &&
    typeof reason.message === 'string' &&
    reason.message.includes('Transition was aborted')
  ) {
    event.preventDefault()
  }
})

const queryClient = new QueryClient()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
)
