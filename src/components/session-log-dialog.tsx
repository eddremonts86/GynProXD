import { CheckCircle } from '@phosphor-icons/react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { exerciseById } from '../lib/exercises'
import { formatClock, pluralize } from '../lib/labels'
import { workoutTotals } from '../lib/stats'
import { cn } from '@/lib/utils'
import type { SetEntry, Workout } from '../lib/types'

/**
 * Everything logged this session, on demand. It used to sit permanently
 * under the card as a run-on string of "60kg × 8 60kg × 8 …" that repeated
 * the rows directly above it. As a dialog it can afford one line per set,
 * which is what makes it readable, and it costs no space until asked for.
 */

function describe(s: SetEntry): string {
  const load = s.weight > 0 ? `${s.weight} kg` : 'Bodyweight'
  const work = s.durationSec ? `${s.durationSec}s` : `${s.reps} reps`
  return `${load} · ${work}${s.side ? ` · ${s.side === 'L' ? 'Left' : 'Right'}` : ''}`
}

export function SessionLogDialog({
  open,
  onOpenChange,
  workout,
  elapsed,
  onSelect,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  workout: Workout
  elapsed: number | null
  /** Jump to a movement; the dialog closes on the way. */
  onSelect: (exerciseId: string) => void
}) {
  const logged = workout.exercises.filter((e) => e.sets.length > 0)
  const totals = workoutTotals(workout)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85dvh] flex-col sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Session log</DialogTitle>
          <DialogDescription>
            {elapsed !== null && `${formatClock(elapsed)} elapsed · `}
            {pluralize(totals.sets, 'set')} ·{' '}
            {Math.round(totals.volume).toLocaleString('en-GB')} kg
          </DialogDescription>
        </DialogHeader>

        {logged.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-3">
            Nothing logged yet. Sets land here as you go.
          </p>
        ) : (
          <div className="-mx-1 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-1">
            {logged.map((e) => {
              const ex = exerciseById(e.exerciseId)
              const target = e.targetSets ?? 0
              return (
                <section key={e.exerciseId} className="flex flex-col gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      onSelect(e.exerciseId)
                      onOpenChange(false)
                    }}
                    className="flex items-baseline justify-between gap-3 text-left"
                  >
                    <span className="truncate text-sm font-semibold text-ink">
                      {ex?.name ?? e.exerciseId}
                    </span>
                    <span className="num shrink-0 text-2xs text-ink-3">
                      {pluralize(e.sets.length, 'set')}
                    </span>
                  </button>
                  <ol className="divide-y divide-line overflow-hidden rounded-md border border-line">
                    {e.sets.map((s, i) => {
                      const beyond = target > 0 && i >= target
                      return (
                        <li
                          key={i}
                          className="flex items-center gap-2.5 bg-surface px-3 py-2"
                        >
                          <CheckCircle
                            size={13}
                            weight="fill"
                            className={cn('shrink-0', beyond ? 'text-over' : 'text-good')}
                          />
                          <span className="num w-4 shrink-0 text-2xs text-ink-3">{i + 1}</span>
                          <span className="num min-w-0 flex-1 truncate text-sm text-ink">
                            {describe(s)}
                          </span>
                          {beyond && (
                            <span className="shrink-0 rounded-full bg-over-soft px-1.5 text-[10px] font-semibold text-over">
                              extra
                            </span>
                          )}
                        </li>
                      )
                    })}
                  </ol>
                </section>
              )
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
