import { AuroraTile } from '@/ui/AuroraTile'
import { formatMinutes, nowState, type DayPlan } from '@/lib/day-plan'
import { clockOf, type LifeProfile } from '@/lib/life-profile'
import { useNowMinutes } from '@/hooks/use-now-minutes'

/**
 * Where the day is, right now, as the screen's one hero figure.
 *
 * The aurora material is reserved for hero data tiles, and this is the datum
 * this screen has: how long until the next thing changes. Green when the time
 * is yours, orange when it is spoken for. On any day that is not today, or once
 * the day is over, the figure becomes the free total instead, because a
 * countdown to nothing is a tile lying about being live.
 */
export function DayNowTile({
  plan,
  profile,
  isToday,
  freeMinutesTotal,
}: {
  plan: DayPlan
  profile: LifeProfile
  isToday: boolean
  freeMinutesTotal: number
}) {
  const now = useNowMinutes()
  const state = nowState(plan, profile, now, isToday)

  if (state.kind === 'other' || state.kind === 'after') {
    return (
      <AuroraTile
        tone="green"
        label={state.kind === 'after' ? 'Day done' : 'Free time'}
        value={formatMinutes(freeMinutesTotal)}
        sub={state.kind === 'after' ? 'was free today, all told' : 'across the day'}
      />
    )
  }

  if (state.kind === 'before') {
    return (
      <AuroraTile
        tone="green"
        label="Not yet"
        value={formatMinutes((state.until ?? now) - now)}
        sub={`until your day starts at ${clockOf(state.until ?? now)}`}
      />
    )
  }

  if (state.kind === 'in') {
    return (
      <AuroraTile
        tone="orange"
        label={state.label ?? 'Busy'}
        value={formatMinutes((state.until ?? now) - now)}
        sub={`left, ends ${clockOf(state.until ?? now)}`}
      />
    )
  }

  return (
    <AuroraTile
      tone="green"
      label="Free"
      value={formatMinutes((state.until ?? now) - now)}
      sub={state.label ? `until ${state.label} at ${clockOf(state.until ?? now)}` : 'until bed'}
    />
  )
}
