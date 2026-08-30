import { ArrowRight, Barbell, Gauge, Heartbeat } from '@phosphor-icons/react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useGym } from '../store/useGym'
import { RETEST_AFTER_DAYS, testAgeDays, testIsStale } from '../lib/fitness-test'
import { LEVEL_LABELS } from '../lib/labels'
import { todayIso } from '../lib/dates'
import { Button } from '../ui/Button'
import { Panel } from '../ui/Panel'
import { cn } from '@/lib/utils'
import { SECTION_ACTION, Section } from '../ui/PageHeader'

/** What the test actually asks of you, so the invitation is not a mystery. */
const STATIONS = ['Push-ups', 'Bodyweight squats', 'High knees']

/**
 * The invitation, for a member who has never tested. It used to render
 * nothing at all, which meant the one screen that shapes the whole programme
 * was reachable only from an empty state that disappears the moment a plan
 * exists.
 */
function UntestedLevel({ stacked }: { stacked: boolean }) {
  const navigate = useNavigate()
  return (
    <Section title="Your level" hint="Not tested" className={stacked ? 'w-full' : undefined}>
      <Panel padding="lg" className="flex flex-col gap-4">
        <div className="flex items-start gap-4">
          <Gauge size={22} weight="regular" className="mt-0.5 shrink-0 text-ink-3" />
          <div className="flex flex-col gap-2">
            <p className="max-w-[60ch] text-sm text-ink-2">
              Three 60-second stations, with as much rest as you want between them. It places you on
              strength and cardio, and the programme designer starts from that instead of guessing.
            </p>
            <ul className="flex flex-wrap items-center gap-x-2 gap-y-1 text-2xs text-ink-3">
              {STATIONS.map((station, i) => (
                <li key={station} className="flex items-center gap-2">
                  {i > 0 && <span aria-hidden="true">&middot;</span>}
                  <span>{station}</span>
                </li>
              ))}
              <li className="num">60s each</li>
            </ul>
          </div>
        </div>
        <div>
          <Button onClick={() => navigate({ to: '/fitness-test' })}>
            Take the 5-minute test
            <ArrowRight size={18} weight="bold" />
          </Button>
        </div>
      </Panel>
    </Section>
  )
}

/**
 * Where the last fitness test placed the member — the two axes the programme
 * designer actually reads, on the home screen so the number that shapes their
 * plan is not out of sight. Retesting is offered at any time, and pressed once
 * the result is stale.
 */
/**
 * `stacked` is the narrow column on Today, where the two axes read better one
 * over the other than squeezed side by side.
 */
export function FitnessLevel({ stacked = false }: { stacked?: boolean }) {
  const fitnessTest = useGym((s) => s.fitnessTest)
  if (!fitnessTest) return <UntestedLevel stacked={stacked} />

  const today = todayIso()
  const stale = testIsStale(fitnessTest, today)
  const weeks = Math.floor(testAgeDays(fitnessTest, today) / 7)

  return (
    <Section
      title="Your level"
      className={stacked ? 'w-full' : undefined}
      hint={weeks === 0 ? 'Just tested' : `${weeks} ${weeks === 1 ? 'week' : 'weeks'} ago`}
      action={
        <Link to="/fitness-test" className={SECTION_ACTION}>
          {stale ? 'Retest' : 'Test again'}
        </Link>
      }
    >
      <Panel
        padding="none"
        className={cn(
          'grid',
          stacked ? 'grid-cols-1 divide-y divide-line' : 'grid-cols-2 divide-x divide-line',
        )}
      >
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
      {stale && (
        <p className="text-2xs text-ink-3">
          Past <span className="num">{RETEST_AFTER_DAYS}</span> days these levels are a guess. A
          retest takes five minutes and re-aims the programme.
        </p>
      )}
    </Section>
  )
}
