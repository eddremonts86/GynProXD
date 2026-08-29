import { Barbell, Heartbeat } from '@phosphor-icons/react'
import { Link } from '@tanstack/react-router'
import { useGym } from '../store/useGym'
import { testAgeDays, testIsStale } from '../lib/fitness-test'
import { LEVEL_LABELS } from '../lib/labels'
import { todayIso } from '../lib/dates'
import { Panel } from '../ui/Panel'
import { Section } from '../ui/PageHeader'

/**
 * Where the last fitness test placed the member — the two axes the programme
 * designer actually reads, on the home screen so the number that shapes their
 * plan is not out of sight. A retest prompt appears once it is stale.
 */
export function FitnessLevel() {
  const fitnessTest = useGym((s) => s.fitnessTest)
  if (!fitnessTest) return null

  const today = todayIso()
  const stale = testIsStale(fitnessTest, today)
  const weeks = Math.floor(testAgeDays(fitnessTest, today) / 7)

  return (
    <Section
      title="Your level"
      hint={weeks === 0 ? 'Just tested' : `${weeks} weeks ago`}
      action={
        stale ? (
          <Link to="/fitness-test" className="text-2xs font-medium text-brand underline underline-offset-2">
            Retest
          </Link>
        ) : undefined
      }
    >
      <Panel padding="none" className="grid grid-cols-2 divide-x divide-line">
        <div className="flex items-center gap-3 p-5">
          <Barbell size={20} className="shrink-0 text-ink-3" />
          <span className="flex flex-col gap-0.5">
            <span className="text-2xs text-ink-3">Strength</span>
            <span className="text-sm font-semibold text-ink">{LEVEL_LABELS[fitnessTest.strength]}</span>
          </span>
        </div>
        <div className="flex items-center gap-3 p-5">
          <Heartbeat size={20} className="shrink-0 text-ink-3" />
          <span className="flex flex-col gap-0.5">
            <span className="text-2xs text-ink-3">Cardio</span>
            <span className="text-sm font-semibold text-ink">{LEVEL_LABELS[fitnessTest.cardio]}</span>
          </span>
        </div>
      </Panel>
    </Section>
  )
}
