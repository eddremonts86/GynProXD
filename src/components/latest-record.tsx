import { useMemo } from 'react'
import { Medal } from '@phosphor-icons/react'
import { useGym } from '../store/useGym'
import { exerciseById, latestPersonalRecord } from '../lib/exercises'
import { formatLongDate } from '../lib/labels'
import { DotNumber } from '../ui/DotNumber'
import { Panel } from '../ui/Panel'
import { Section } from '../ui/PageHeader'

/**
 * The most recent estimated-1RM personal record, celebrated once on the home
 * screen instead of staying buried in a finished-session summary. Absent
 * until a loaded lift actually beats a previous best.
 */
export function LatestRecord() {
  const workouts = useGym((s) => s.workouts)
  const pr = useMemo(() => latestPersonalRecord(workouts), [workouts])
  if (!pr) return null

  const exercise = exerciseById(pr.exerciseId)

  return (
    <Section title="Latest record">
      <Panel padding="lg" className="flex items-center gap-4">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand">
          <Medal size={22} weight="fill" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-sm font-semibold text-ink">
            {exercise?.name ?? 'Personal record'}
          </span>
          <span className="text-2xs text-ink-3">
            Estimated 1RM · {pr.weight} kg × {pr.reps} · {formatLongDate(pr.date)}
          </span>
        </div>
        <DotNumber value={pr.e1rm} unit="kg" size="md" className="shrink-0 text-ink" />
      </Panel>
    </Section>
  )
}
