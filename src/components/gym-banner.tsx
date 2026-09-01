import { useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { Megaphone, X } from '@phosphor-icons/react'
import { useSession } from '@/store/useSession'
import { useMessages } from '@/store/useMessages'
import { activeBanners } from '@/lib/messages'
import { viewerFor } from '@/lib/profiles'

/**
 * The announcement strip under the top bar. Only messages published with a
 * banner window surface here, only for their audience, and only until the
 * window closes or the member dismisses them. Newest first; one at a time.
 */
export function GymBanner() {
  const profileId = useSession((s) => s.profileId)
  const gym = useSession((s) => s.gym)
  const messages = useMessages((s) => s.messages)
  const dismissBanner = useMessages((s) => s.dismissBanner)

  /* Banners expire on the clock, not on user action: re-check twice a minute. */
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [])

  if (!profileId) return null
  const banners = activeBanners(messages, viewerFor(profileId, gym), now)
  const top = banners[0]
  if (!top) return null

  return (
    <div
      role="status"
      className="mb-6 flex items-center gap-3 rounded-lg bg-brand px-4 py-3 text-brand-ink shadow-[var(--shadow-panel)]"
    >
      <Megaphone size={18} weight="fill" className="shrink-0 opacity-80" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{top.title}</span>
        {top.body && <span className="block truncate text-2xs opacity-75">{top.body}</span>}
      </span>
      {banners.length > 1 && (
        <span className="num shrink-0 text-2xs opacity-70">+{banners.length - 1} more</span>
      )}
      <Link
        to={top.link === 'menu' ? '/menu' : '/inbox'}
        className="shrink-0 rounded-full bg-brand-ink px-3.5 py-1.5 text-2xs font-semibold text-brand transition-transform active:scale-[0.98]"
      >
        {top.link === 'menu' ? 'See the menu' : 'View'}
      </Link>
      <button
        type="button"
        aria-label="Dismiss announcement"
        onClick={() => dismissBanner(top.id, profileId)}
        className="flex size-7 shrink-0 items-center justify-center rounded-full opacity-70 transition-opacity hover:opacity-100"
      >
        <X size={15} weight="bold" />
      </button>
    </div>
  )
}
