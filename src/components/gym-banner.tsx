import { useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { Megaphone, X } from '@phosphor-icons/react'
import { useSession } from '@/store/useSession'
import { useMessages } from '@/store/useMessages'
import { activeBanners, scopeOf } from '@/lib/messages'
import { viewerFor } from '@/lib/profiles'
import { brandSurface } from '@/lib/brand'
import { gymBrandColor } from '@/lib/sync'
import { cn } from '@/lib/utils'

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

  /**
   * The gym's colour, read from the server rather than kept.
   *
   * A gym changes it when it changes; a cached copy would leave a member
   * looking at last month's paint with no way to know why. Absent for a
   * profile with no account, which is every member who never turned sync on —
   * they see the app's own colour, which is the honest answer since there is
   * nothing to ask.
   */
  const [brand, setBrand] = useState<string | null>(null)
  useEffect(() => {
    if (!profileId || !gym) return
    let alive = true
    gymBrandColor(profileId, gym)
      .then((c) => { if (alive) setBrand(c) })
      .catch(() => {})
    return () => { alive = false }
  }, [profileId, gym])

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

  /**
   * The gym's own colour, when it has one that can carry words.
   *
   * Only for its own messages: `scopeOf` is `members` or `open-door` for a gym
   * and anything else is the platform speaking, which must never arrive wearing
   * a gym's paint. And only when the colour can carry text — the band that
   * neither ink clears runs through the middle of the palette, and a banner
   * nobody can read is worse than one in the app's own colour.
   */
  const own = scopeOf(top) === 'members' || scopeOf(top) === 'open-door'
  const paint = own ? brandSurface(brand) : null
  const wearing = paint?.text ? paint : null

  return (
    <div
      role="status"
      className={cn(
        'mb-6 flex items-center gap-3 rounded-lg px-4 py-3 shadow-[var(--shadow-panel)]',
        wearing ? '' : 'bg-brand text-brand-ink',
      )}
      style={wearing ? { background: wearing.bg, color: wearing.ink } : undefined}
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
