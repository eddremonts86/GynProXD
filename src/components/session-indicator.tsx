import { Link, useRouterState } from '@tanstack/react-router'
import { Barbell } from '@phosphor-icons/react'
import { useGym } from '@/store/useGym'
import { useElapsedSeconds } from '@/hooks/use-elapsed'
import { formatClock, pluralize } from '@/lib/labels'

/**
 * Null when there is nothing to point at, including while the session screen
 * itself is open: repeating the clock next to itself just reads as a glitch.
 */
function useActiveSession() {
  const activeWorkout = useGym((s) => s.activeWorkout)
  const onSessionScreen = useRouterState({ select: (s) => s.location.pathname === '/' })
  const elapsed = useElapsedSeconds(activeWorkout?.startedAt)
  if (!activeWorkout || onSessionScreen) return null
  const sets = activeWorkout.exercises.reduce((n, e) => n + e.sets.length, 0)
  return { elapsed, sets }
}

/** Rail version: a session left running must stay findable from any route. */
export function SessionRailCard() {
  const session = useActiveSession()
  if (!session) return null
  return (
    <Link
      to="/"
      className="flex flex-col gap-2 rounded-lg bg-surface p-3 shadow-[var(--shadow-panel)] transition-shadow hover:shadow-[var(--shadow-tile)]"
    >
      <span className="flex items-center gap-1.5 text-2xs font-medium text-ink-2">
        <Barbell size={14} weight="bold" />
        Session in progress
      </span>
      <span className="num-dot text-2xl leading-none text-ink">
        {session.elapsed === null ? '--:--' : formatClock(session.elapsed)}
      </span>
      <span className="text-2xs text-ink-3">{pluralize(session.sets, 'set')} logged</span>
    </Link>
  )
}

/** Mobile version: a slim bar that sits directly above the bottom nav. */
export function SessionMobileBar() {
  const session = useActiveSession()
  if (!session) return null
  return (
    <Link
      to="/"
      className="flex items-center gap-2 bg-surface/95 px-4 py-2.5 shadow-[var(--shadow-raised)] backdrop-blur"
    >
      <Barbell size={16} weight="bold" className="shrink-0 text-ink-2" />
      <span className="text-xs font-medium text-ink-2">Session in progress</span>
      <span className="num-dot ml-auto text-lg leading-none text-ink">
        {session.elapsed === null ? '--:--' : formatClock(session.elapsed)}
      </span>
    </Link>
  )
}
