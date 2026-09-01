import { useEffect, useState } from 'react'
import { ArrowClockwise, Play, Timer } from '@phosphor-icons/react'
import { scoreFitnessTest } from '../lib/fitness-test'
import { todayIso } from '../lib/dates'
import { LEVEL_LABELS, EFFORT_LABELS } from '../lib/labels'
import { useGym } from '../store/useGym'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { Tag } from '../ui/Tag'
import { cn } from '@/lib/utils'
import type { FitnessTestInput, FitnessTestResult } from '../lib/fitness-test'

const STATIONS: { key: keyof FitnessTestInput; name: string; cue: string }[] = [
  { key: 'pushups', name: 'Push-ups', cue: 'As many as you can in 60 seconds. Knee push-ups count.' },
  { key: 'squats', name: 'Bodyweight squats', cue: 'Full depth, controlled.' },
  { key: 'highKnees', name: 'High knees', cue: 'Count each right knee. Keep breathing.' },
]

/**
 * The five-minute placement test, inside the intake instead of a page away.
 *
 * It used to be a link. Somebody unsure of their experience level was asked to
 * leave a half-filled form, take a test, and find their way back — and the form
 * read the result once on mount, so returning to it showed the old answer
 * anyway. Two reasons nobody took the test, and the second one meant the people
 * who did got nothing for it.
 *
 * Three 60-second clocks, one at a time, and the result lands in the same store
 * the standalone page writes to. Taking it here and taking it there are the same
 * act with the same record.
 */
export function InlineFitnessTest({
  onResult,
}: {
  onResult: (result: FitnessTestResult) => void
}) {
  const setFitnessTest = useGym((s) => s.setFitnessTest)
  const existing = useGym((s) => s.fitnessTest)

  const [open, setOpen] = useState(false)
  const [counts, setCounts] = useState<Record<keyof FitnessTestInput, string>>({
    pushups: '',
    squats: '',
    highKnees: '',
  })
  const [clock, setClock] = useState<{ station: keyof FitnessTestInput; left: number } | null>(null)

  /* One clock at a time, ticking inside the updater so the effect stays free of
     synchronous setState — the same shape as the rest timer in Today. */
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
    onResult(result)
    setOpen(false)
  }

  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-dashed border-line bg-surface px-4 py-3">
        <Timer size={15} className="shrink-0 text-ink-3" />
        <p className="min-w-0 flex-1 text-2xs leading-snug text-ink-3">
          {existing ? (
            <>
              Filled in from your fitness test:{' '}
              <span className="text-ink-2">{LEVEL_LABELS[existing.strength].toLowerCase()}</span>,
              effort <span className="text-ink-2">{EFFORT_LABELS[existing.suggestedEffort].toLowerCase()}</span>.
            </>
          ) : (
            <>Not sure? Three exercises, sixty seconds each, right here. It answers both fields above.</>
          )}
        </p>
        <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
          {existing ? <ArrowClockwise size={14} /> : <Play size={14} weight="fill" />}
          {existing ? 'Take it again' : 'Take the test'}
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 rounded-xl bg-surface p-4 shadow-[var(--shadow-panel)]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h4 className="text-xs font-semibold text-ink">Five-minute test</h4>
          <p className="max-w-[52ch] text-2xs leading-snug text-ink-3">
            Rest as long as you need between stations. Only the minute counts, and honesty is
            the instrument — a flattering number buys you a programme built for somebody else.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Close
        </Button>
      </div>

      <div className="flex flex-col gap-3">
        {STATIONS.map((s) => {
          const running = clock?.station === s.key
          return (
            <div
              key={String(s.key)}
              className={cn(
                'grid grid-cols-1 gap-3 rounded-lg border p-3 transition-colors duration-150 sm:grid-cols-[1fr_auto_7rem]',
                running ? 'border-brand bg-brand-soft' : 'border-line',
              )}
            >
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="text-xs font-medium text-ink">{s.name}</span>
                <span className="text-2xs leading-snug text-ink-3">{s.cue}</span>
              </div>
              <Button
                variant={running ? 'primary' : 'secondary'}
                size="sm"
                disabled={clock !== null && !running}
                onClick={() => setClock({ station: s.key, left: 60 })}
                className="num self-start sm:self-center"
              >
                {running ? `${clock.left}s` : <><Play size={13} weight="fill" />60s</>}
              </Button>
              <Input
                label="Reps"
                value={counts[s.key]}
                onChange={(e) => setCounts((c) => ({ ...c, [s.key]: e.target.value }))}
                inputMode="numeric"
                placeholder="0"
              />
            </div>
          )
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
        <p className="text-2xs text-ink-3">
          {complete ? (
            <Tag tone="good">Ready to score</Tag>
          ) : (
            'Enter a count for all three to score it.'
          )}
        </p>
        <Button variant="primary" size="sm" disabled={!complete} onClick={save}>
          Score and fill the fields
        </Button>
      </div>
    </div>
  )
}
