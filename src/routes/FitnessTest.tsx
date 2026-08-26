import { useEffect, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { ArrowRight, Timer } from '@phosphor-icons/react'
import { useGym } from '../store/useGym'
import { scoreFitnessTest, testAgeDays, type FitnessTestInput } from '../lib/fitness-test'
import { todayIso } from '../lib/dates'
import { LEVEL_LABELS, formatClock, formatLongDate } from '../lib/labels'
import { Button } from '../ui/Button'
import { NumberField } from '../ui/NumberField'
import { Panel } from '../ui/Panel'
import { Tag } from '../ui/Tag'
import { PageHeader, Section } from '../ui/PageHeader'

interface Station {
  key: keyof FitnessTestInput
  name: string
  cue: string
}

const STATIONS: Station[] = [
  { key: 'pushups', name: 'Push-ups', cue: 'As many as you can in 60 seconds. Knee push-ups count.' },
  { key: 'squats', name: 'Bodyweight squats', cue: 'Full depth, controlled. 60 seconds.' },
  { key: 'highKnees', name: 'High knees', cue: 'Count each right knee. 60 seconds, keep breathing.' },
]

/**
 * The five-minute placement test. Each station has its own 60-second clock;
 * the member counts reps and types the number — honesty is the instrument.
 * Rest as long as needed between stations; only effort inside the minute
 * matters.
 */
export function FitnessTestPage() {
  const navigate = useNavigate()
  const fitnessTest = useGym((s) => s.fitnessTest)
  const setFitnessTest = useGym((s) => s.setFitnessTest)

  const [counts, setCounts] = useState<Record<keyof FitnessTestInput, string>>({
    pushups: '',
    squats: '',
    highKnees: '',
  })
  /* One clock at a time; null means no station is running. Ticking inside
     the updater keeps the effect free of synchronous setState, matching the
     rest timer in Today. */
  const [clock, setClock] = useState<{ station: keyof FitnessTestInput; left: number } | null>(null)

  useEffect(() => {
    if (clock === null) return
    const id = window.setTimeout(() => {
      setClock((c) => (c === null || c.left - 1 <= 0 ? null : { ...c, left: c.left - 1 }))
    }, 1000)
    return () => window.clearTimeout(id)
  }, [clock])

  const complete = STATIONS.every((s) => Number(counts[s.key]) > 0)

  const save = () => {
    const result = scoreFitnessTest(
      {
        pushups: Number(counts.pushups),
        squats: Number(counts.squats),
        highKnees: Number(counts.highKnees),
      },
      todayIso(),
    )
    setFitnessTest(result)
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Fitness test"
        description="Five minutes, no equipment. Three stations of 60 seconds; rest as much as you need between them."
      />

      {fitnessTest && (
        <Panel padding="lg" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold text-ink">Your latest result</h2>
            <span className="num text-2xs text-ink-3">
              {formatLongDate(fitnessTest.takenAt)} · {testAgeDays(fitnessTest, todayIso())} days ago
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Tag tone="brand">Strength: {LEVEL_LABELS[fitnessTest.strength]}</Tag>
            <Tag tone="brand">Cardio: {LEVEL_LABELS[fitnessTest.cardio]}</Tag>
            <Tag tone="outline">Suggested effort {fitnessTest.suggestedEffort}/5</Tag>
          </div>
          <div>
            <Button variant="secondary" size="sm" onClick={() => void navigate({ to: '/onboarding' })}>
              Use it in the programme designer
              <ArrowRight size={14} weight="bold" />
            </Button>
          </div>
        </Panel>
      )}

      <Section title="Stations" hint="60 seconds each">
        <div className="flex flex-col gap-4">
          {STATIONS.map((s) => (
            <Panel key={s.key} padding="lg" className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-base font-semibold text-ink">{s.name}</h3>
                  <p className="mt-0.5 max-w-[52ch] text-sm text-ink-3">{s.cue}</p>
                </div>
                {clock?.station === s.key ? (
                  <span className="flex items-center gap-2 text-ink">
                    <Timer size={18} weight="bold" className="text-brand" />
                    <span className="num-dot text-2xl leading-none">{formatClock(clock.left)}</span>
                  </span>
                ) : (
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={clock !== null}
                    onClick={() => setClock({ station: s.key, left: 60 })}
                  >
                    <Timer size={15} />
                    Start 60s
                  </Button>
                )}
              </div>
              <div className="max-w-56">
                <NumberField
                  label="Your count"
                  value={counts[s.key]}
                  onValueChange={(v) => setCounts((prev) => ({ ...prev, [s.key]: v }))}
                  min={0}
                  max={500}
                  step={1}
                />
              </div>
            </Panel>
          ))}
        </div>
      </Section>

      <div>
        <Button disabled={!complete} onClick={save}>
          Score my test
        </Button>
      </div>
    </div>
  )
}
