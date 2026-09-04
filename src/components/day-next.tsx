import { SunHorizon } from '@phosphor-icons/react'
import { Link } from '@tanstack/react-router'
import { Panel } from '@/ui/Panel'
import { formatMinutes, freeMinutes } from '@/lib/day-plan'
import { useDayPlan } from '@/lib/use-day-plan'
import { isBuilt } from '@/lib/member-plan'
import { useSession } from '@/store/useSession'
import { todayIso } from '@/lib/dates'

/**
 * One line on Today, and the way into `/day` on a phone.
 *
 * Deliberately one line. Today is the busiest screen in the app and the last
 * thing it needs is a second timeline; this says when the session lands and how
 * much of the day is still yours, and the rest is a tap away.
 *
 * No plate is fetched for it, which is the point of `useDayPlan` taking one as
 * a parameter: a sentence on the app's most visited screen must not cost a
 * recipe-catalogue request. The session time is the same either way, because
 * `buildDay` places training before the plate.
 *
 * It says "No session today" rather than "Nothing scheduled": a day with work
 * and a school run on it is not a day with nothing on it, and the sentence is
 * about the session because that is what Today is about. On a day with nothing
 * at all the line does not render, because Today already says as much and a
 * second line saying it again is furniture.
 */
export function DayNext() {
  const pro = useSession((s) => s.pro)
  const date = todayIso()
  const { plan, profile } = useDayPlan(date)

  if (!pro || !isBuilt('day-plan')) return null
  if (plan.slots.length === 0) return null

  const session = plan.slots.find((s) => s.kind === 'training')
  const free = formatMinutes(freeMinutes(plan, profile))

  return (
    <Panel padding="none" tone="quiet">
      <Link
        to="/day"
        className="flex min-h-11 items-center gap-2.5 px-4 py-2.5 hover:bg-surface-2"
      >
        <SunHorizon size={18} className="shrink-0 text-brand" />
        <span className="min-w-0 flex-1 truncate text-sm text-ink-2">
          {session ? (
            <>
              Session at <span className="num text-ink">{session.start}</span>
            </>
          ) : (
            'No session today'
          )}
          <span className="text-ink-3"> · </span>
          <span className="num text-ink-3">{free} free</span>
        </span>
        <span className="shrink-0 text-2xs font-medium text-brand">Your day</span>
      </Link>
    </Panel>
  )
}
