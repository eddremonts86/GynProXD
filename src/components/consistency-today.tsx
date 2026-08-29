import { useMemo } from 'react'
import { useGym } from '../store/useGym'
import { dailySetSeries, trainingStreak } from '../lib/stats'
import { todayIso } from '../lib/dates'
import { DotNumber } from '../ui/DotNumber'
import { Panel } from '../ui/Panel'
import { Section } from '../ui/PageHeader'
import { cn } from '@/lib/utils'

/**
 * The near-term habit at a glance: the current day streak and the last two
 * weeks as a dot row. History holds the full 26-week calendar; this answers
 * only "am I on a roll right now", right where the day starts.
 */
export function ConsistencyToday() {
  const workouts = useGym((s) => s.workouts)
  const today = todayIso()

  const { streak, days } = useMemo(
    () => ({ streak: trainingStreak(workouts), days: dailySetSeries(workouts, 2) }),
    [workouts],
  )
  if (workouts.length === 0) return null

  return (
    <Section title="Consistency" hint="Last 2 weeks">
      <Panel padding="lg" className="flex items-center justify-between gap-6">
        <span className="flex flex-col gap-0.5">
          <DotNumber value={streak} unit={streak === 1 ? 'day' : 'days'} size="lg" className="text-ink" />
          <span className="text-2xs text-ink-3">{streak > 0 ? 'on a streak' : 'start one today'}</span>
        </span>
        <div
          role="img"
          aria-label={`Trained on ${days.filter((d) => d.sets > 0).length} of the last 14 days`}
          className="flex items-end gap-[3px]"
        >
          {days.map((d) => (
            <span
              key={d.date}
              title={d.date}
              className={cn(
                'size-3.5 rounded-[3px]',
                d.date > today ? 'invisible' : d.sets > 0 ? 'bg-brand' : 'bg-surface-2',
              )}
            />
          ))}
        </div>
      </Panel>
    </Section>
  )
}
