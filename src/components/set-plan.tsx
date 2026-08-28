import { ArrowCounterClockwise, Check, Warning } from '@phosphor-icons/react'
import { Button } from '../ui/Button'
import { NumberField } from '../ui/NumberField'
import { pluralize } from '../lib/labels'
import { cn } from '@/lib/utils'
import type { SetEntry } from '../lib/types'

/** Sets past the target where "bonus" turns into "be careful". */
const OVERREACH = 3

/**
 * The session's work laid out as rows rather than one anonymous input.
 *
 * The old card asked "weight? reps?" over and over and left the member
 * counting their own sets. Here the whole day is visible: what is done, what
 * is next, and what is still coming — each row pre-filled with the number the
 * progression rule suggests, so the common case is confirming rather than
 * typing. Only the next row is editable: logging set three before set two is
 * not a thing anyone means to do.
 */

export interface SetPlanProps {
  logged: SetEntry[]
  /** Target from the intensity dial. Absent on freeform sessions. */
  targetSets?: number
  isTimed: boolean
  isUnilateral: boolean
  /** Pre-filled values for the row being worked on. */
  weight: string
  reps: string
  duration: string
  side: 'L' | 'R'
  onWeight: (v: string) => void
  onReps: (v: string) => void
  onDuration: (v: string) => void
  onSide: (s: 'L' | 'R') => void
  canLog: boolean
  /** Cardio and stretching carry no load, so kilos are not required. */
  weightOptional?: boolean
  hint?: string
  onLog: () => void
  onUndo: (index: number) => void
  onAddSet: () => void
}

function describe(s: SetEntry, isTimed: boolean): string {
  const load = s.weight > 0 ? `${s.weight} kg` : 'Bodyweight'
  const work = isTimed || s.durationSec ? `${s.durationSec}s` : `${s.reps} reps`
  return `${load} · ${work}${s.side ? ` · ${s.side === 'L' ? 'Left' : 'Right'}` : ''}`
}

export function SetPlan({
  logged,
  targetSets,
  isTimed,
  isUnilateral,
  weight,
  reps,
  duration,
  side,
  onWeight,
  onReps,
  onDuration,
  onSide,
  canLog,
  weightOptional,
  hint,
  onLog,
  onUndo,
  onAddSet,
}: SetPlanProps) {
  const done = logged.length
  const target = targetSets ?? 0
  const extra = target > 0 ? Math.max(0, done - target) : 0
  /* Rows beyond the target still show once logged: going over is not an error. */
  const upcoming = Math.max(0, target - done)
  const activeIsExtra = done >= target

  return (
    <div className="flex flex-col">
      <ol className="divide-y divide-line">
        {logged.map((s, i) => {
          const beyondTarget = target > 0 && i >= target
          return (
          <li key={i} className="flex items-center gap-3 px-5 py-3">
            <span
              className={cn(
                'num flex size-7 shrink-0 items-center justify-center rounded-full text-2xs font-semibold',
                beyondTarget ? 'bg-brand-soft text-brand' : 'bg-good-soft text-good',
              )}
            >
              <Check size={13} weight="bold" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5 text-2xs text-ink-3">
                Set {i + 1}
                {beyondTarget && (
                  <span className="rounded-full bg-brand-soft px-1.5 text-[10px] font-semibold text-brand">
                    extra
                  </span>
                )}
              </span>
              <span className="num block truncate text-sm text-ink">{describe(s, isTimed)}</span>
            </span>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onUndo(i)}
              aria-label={`Undo set ${i + 1}`}
            >
              <ArrowCounterClockwise size={14} />
              Undo
            </Button>
          </li>
          )
        })}

        {/* The row you are on: pre-filled, editable, one tap to confirm. */}
        <li className="flex flex-col gap-3 bg-surface-2/60 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="num flex size-7 shrink-0 items-center justify-center rounded-full bg-brand text-2xs font-semibold text-brand-ink">
              {done + 1}
            </span>
            <span className="text-sm font-medium text-ink">
              {activeIsExtra ? 'Extra set' : `Set ${done + 1}`}
              {!activeIsExtra && target > 0 && (
                <span className="num ml-1.5 text-2xs font-normal text-ink-3">of {target}</span>
              )}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <NumberField
              label={weightOptional ? 'Weight (optional)' : 'Weight'}
              unit="kg"
              value={weight}
              onValueChange={onWeight}
              step={2.5}
              decimals={1}
              max={500}
            />
            {isTimed ? (
              <NumberField
                label="Time"
                unit="sec"
                value={duration}
                onValueChange={onDuration}
                step={5}
                min={1}
                max={3600}
              />
            ) : (
              <NumberField
                label="Reps"
                value={reps}
                onValueChange={onReps}
                step={1}
                min={1}
                max={200}
              />
            )}
          </div>

          {isUnilateral && (
            <fieldset className="flex items-center gap-2">
              <legend className="sr-only">Which side</legend>
              {(['L', 'R'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => onSide(s)}
                  aria-pressed={side === s}
                  className={cn(
                    'h-11 flex-1 rounded-md border text-sm font-medium transition-all duration-150 active:scale-[0.98]',
                    side === s
                      ? 'border-brand bg-brand text-brand-ink'
                      : 'border-line bg-surface text-ink-3 hover:border-line-strong hover:text-ink',
                  )}
                >
                  {s === 'L' ? 'Left' : 'Right'}
                </button>
              ))}
            </fieldset>
          )}

          <Button
            size="lg"
            onClick={onLog}
            disabled={!canLog}
            className="w-full transition-transform active:scale-[0.99]"
          >
            <Check size={16} weight="bold" />
            Log set {done + 1}
          </Button>

          {!canLog && hint && <p className="text-center text-2xs text-ink-3">{hint}</p>}
        </li>

        {/* What is still ahead, so the size of the job is never a surprise. */}
        {Array.from({ length: Math.max(0, upcoming - 1) }, (_, i) => (
          <li key={`todo-${i}`} className="flex items-center gap-3 px-5 py-3 opacity-55">
            <span className="num flex size-7 shrink-0 items-center justify-center rounded-full border border-dashed border-line text-2xs font-semibold text-ink-3">
              {done + 2 + i}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-2xs text-ink-3">Set {done + 2 + i}</span>
              <span className="num block truncate text-sm text-ink-3">
                {weight === '' || Number(weight) === 0 ? 'Bodyweight' : `${weight} kg`} ·{' '}
                {isTimed ? `${duration || 0}s` : `${reps || 0} reps`}
              </span>
            </span>
            <span className="text-2xs text-ink-3">To do</span>
          </li>
        ))}
      </ol>

      {activeIsExtra && target > 0 && extra < OVERREACH && (
        <p className="border-t border-line px-5 py-3 text-2xs text-ink-3">
          Target met. Anything more is a bonus — log it or move on.
        </p>
      )}

      {/* Past a few extra sets this stops being a bonus. Said plainly, once,
          without blocking anything: it is the member's call, not the app's. */}
      {extra >= OVERREACH && (
        <p className="flex items-start gap-2 border-t border-line bg-danger-soft px-5 py-3 text-2xs text-ink-2">
          <Warning size={14} weight="bold" className="mt-px shrink-0 text-danger" />
          <span>
            <span className="font-semibold">
              {pluralize(extra, 'set')} past the target.
            </span>{' '}
            Volume beyond the plan piles up fatigue faster than progress, and that is where most
            avoidable strains come from. A good place to stop.
          </span>
        </p>
      )}

      {done > 0 && (
        <div className="border-t border-line px-5 py-3">
          <Button size="sm" variant="ghost" onClick={onAddSet}>
            Move to the next movement
          </Button>
        </div>
      )}
    </div>
  )
}
