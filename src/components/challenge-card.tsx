import { useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { CheckCircle, Fire } from '@phosphor-icons/react'
import {
  challengeCalendar,
  challengeStreak,
  isChallengeComplete,
  type ActiveChallenge,
} from '../lib/challenge'
import { todayIso } from '../lib/dates'
import { exerciseById } from '../lib/exercises'
import { pluralize } from '../lib/labels'
import { Button } from '../ui/Button'
import { ExerciseThumb } from '../ui/ExerciseThumb'
import { Panel } from '../ui/Panel'
import { Tag } from '../ui/Tag'
import { cn } from '@/lib/utils'

/**
 * The tappable countdown calendar: one cell per day carrying its rep count.
 * Past days stay tappable — catching up is allowed, pressure is not.
 */
export function ChallengeCard({
  state,
  onToggleDay,
  onLeave,
}: {
  state: ActiveChallenge
  onToggleDay: (dateIso: string) => void
  onLeave: () => void
}) {
  const reduceMotion = useReducedMotion()
  const [confirmLeave, setConfirmLeave] = useState(false)
  const today = todayIso()
  const calendar = challengeCalendar(state, today)
  const done = calendar.filter((d) => d.done).length
  const streak = challengeStreak(state, today)
  const complete = isChallengeComplete(state)
  const exercise = exerciseById(state.challenge.exerciseId)
  const unitShort = state.challenge.unit === 'seconds' ? 's' : ''

  return (
    <Panel padding="none" className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b border-line p-5">
        {exercise && <ExerciseThumb exercise={exercise} size="md" />}
        <div className="min-w-0 flex-1">
          <h3 className="flex items-center gap-2 text-lg text-ink">
            {state.challenge.name}
            {complete && (
              <motion.span
                initial={reduceMotion ? false : { scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="inline-flex"
              >
                <Tag tone="good">Completed</Tag>
              </motion.span>
            )}
          </h3>
          <p className="mt-0.5 text-2xs text-ink-3">
            {exercise?.name ?? state.challenge.exerciseId} · {done}/{state.challenge.days} days
          </p>
        </div>
        {streak > 1 && !complete && (
          <span className="flex items-center gap-1 text-sm font-medium text-ink-2">
            <Fire size={16} weight="fill" className="text-brand" />
            <span className="num">{pluralize(streak, 'day')}</span>
          </span>
        )}
      </div>

      <ul className="grid grid-cols-6 gap-1.5 p-5 sm:grid-cols-10">
        {calendar.map((d) => (
          <li key={d.day}>
            <button
              type="button"
              disabled={d.future}
              onClick={() => onToggleDay(d.dateIso)}
              aria-pressed={d.done}
              aria-label={`Day ${d.day}, ${d.reps} ${state.challenge.unit}${d.done ? ', done' : ''}`}
              className={cn(
                'flex min-h-12 w-full flex-col items-center justify-center rounded-md border text-center transition-colors duration-150',
                d.done && 'border-brand bg-brand text-brand-ink',
                !d.done && d.isToday && 'border-brand bg-surface text-ink',
                !d.done && d.missed && 'border-dashed border-line text-ink-3 hover:border-line-strong',
                d.future && 'border-line/60 text-ink-3/50',
              )}
            >
              <span className={cn('num text-2xs leading-none', d.done ? 'opacity-80' : 'opacity-60')}>
                {d.day}
              </span>
              <span className="num text-sm leading-tight font-semibold">
                {d.reps}
                {unitShort}
              </span>
            </button>
          </li>
        ))}
      </ul>

      <div className="flex items-center justify-between gap-3 border-t border-line bg-surface-2 px-5 py-2.5">
        {complete ? (
          <p className="flex items-center gap-1.5 text-sm text-ink-2">
            <CheckCircle size={16} weight="fill" className="text-good" />
            Every day done. That is the whole challenge.
          </p>
        ) : (
          <p className="text-2xs text-ink-3">
            Split the {state.challenge.unit} through the day if you need to. Rest as needed, keep
            good form.
          </p>
        )}
        {confirmLeave ? (
          <span className="flex shrink-0 items-center gap-1.5">
            <Button size="sm" variant="ghost" onClick={() => setConfirmLeave(false)}>
              Keep it
            </Button>
            <Button size="sm" variant="danger" onClick={onLeave}>
              Leave
            </Button>
          </span>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => setConfirmLeave(true)}>
            Leave
          </Button>
        )}
      </div>
    </Panel>
  )
}
