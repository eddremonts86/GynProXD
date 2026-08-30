import { ArrowClockwise } from '@phosphor-icons/react'
import { applyUpdate, useUpdateReady } from '@/lib/pwa-update'
import { Button } from '@/ui/Button'

/**
 * The offer, once a newer build is sitting in the wings. It floats clear of
 * the bottom navigation and the home indicator, says what it is in one line
 * and asks for one tap.
 *
 * There is no dismiss: the bar is the only signal that the app is behind, and
 * an installed PWA has no address bar to reveal that any other way. It is also
 * cheap to ignore — nothing here blocks the page, and closing every tab
 * applies the update anyway.
 */
export function UpdateBanner() {
  const ready = useUpdateReady()
  if (!ready) return null

  return (
    <div
      role="status"
      aria-live="polite"
      data-print="hide"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-[calc(env(safe-area-inset-bottom)+5.5rem)] lg:justify-end lg:pb-6 lg:pr-6"
    >
      <div className="pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-xl bg-brand px-4 py-3 text-brand-ink shadow-[var(--shadow-overlay)]">
        <ArrowClockwise size={18} weight="bold" className="shrink-0 opacity-80" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">A new version is ready</span>
          <span className="block text-2xs opacity-75">Your training is saved. This takes a second.</span>
        </span>
        <Button
          size="sm"
          aria-label="Update to the new version and reload"
          onClick={applyUpdate}
          className="shrink-0 bg-brand-ink text-brand hover:bg-brand-ink"
        >
          Update
        </Button>
      </div>
    </div>
  )
}
