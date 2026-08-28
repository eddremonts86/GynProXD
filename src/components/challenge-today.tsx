import { useMemo } from 'react'
import { CheckCircle, Circle, Flame } from '@phosphor-icons/react'
import { useGym } from '../store/useGym'
import { exerciseById } from '../lib/exercises'
import { todayIso } from '../lib/dates'
import { pluralize } from '../lib/labels'
import {
  challengeCalendar,
  challengeStreak,
  isChallengeComplete,
  repsForDay,
} from '../lib/challenge'
import { Button } from '../ui/Button'
import { DotNumber } from '../ui/DotNumber'
import { ExerciseThumb } from '../ui/ExerciseThumb'
import { Panel } from '../ui/Panel'
import { Section } from '../ui/PageHeader'
import { Tag } from '../ui/Tag'

/**
 * The active challenge's number for today, on the home screen where it is
 * actually acted on — the old flow buried it behind a trip to Challenges.
 * One movement, one figure, one tap to mark it done. Absent unless a
 * challenge is running, so Today never carries an empty shell.
 */
export function ChallengeToday() {
  const challenges = useGym((s) => s.challenges)
  const toggleChallengeDay = useGym((s) => s.toggleChallengeDay)
  const today = todayIso()

  const active = useMemo(
    () => challenges.find((c) => !isChallengeComplete(c)) ?? null,
    [challenges],
  )
  const view = useMemo(() => {
    if (!active) return null
    const calendar = challengeCalendar(active, today)
    const todayEntry = calendar.find((d) => d.isToday)
    return {
      todayEntry,
      done: calendar.filter((d) => d.done).length,
      streak: challengeStreak(active, today),
    }
  }, [active, today])

  if (!active || !view) return null

  const { challenge } = active
  const exercise = exerciseById(challenge.exerciseId)
  const entry = view.todayEntry
  const reps = entry ? entry.reps : repsForDay(challenge, challenge.days)
  const unit = challenge.unit === 'seconds' ? 'sec' : challenge.unit
  const dayNumber = entry?.day ?? challenge.days
  const progress = Math.round((view.done / challenge.days) * 100)
  const doneToday = entry?.done ?? false

  return (
    <Section
      title="Today's challenge"
      hint={`Day ${dayNumber} of ${challenge.days}`}
      action={
        view.streak > 0 ? (
          <span className="flex items-center gap-1 text-2xs font-medium text-over">
            <Flame size={13} weight="fill" />
            {pluralize(view.streak, 'day')} streak
          </span>
        ) : undefined
      }
    >
      <Panel padding="none" className="overflow-hidden sm:flex">
        {exercise && (
          <div className="hidden sm:block sm:w-40 sm:shrink-0">
            <ExerciseThumb exercise={exercise} size="fill" className="rounded-none border-0 sm:h-full" />
          </div>
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-3 p-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-1">
              <h3 className="truncate text-xl text-ink">{challenge.name}</h3>
              <DotNumber value={reps} unit={entry ? `${unit} today` : unit} size="lg" />
            </div>
            <Button
              variant={doneToday ? 'secondary' : 'primary'}
              onClick={() => entry && toggleChallengeDay(challenge.id, entry.dateIso)}
              disabled={!entry}
            >
              {doneToday ? <CheckCircle size={18} weight="fill" /> : <Circle size={18} />}
              {doneToday ? 'Done today' : 'Mark done'}
            </Button>
          </div>

          {/* Days completed, filling with the page's own easing. */}
          <div className="flex items-center gap-2">
            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
              <span
                className="block h-full rounded-full bg-brand transition-[width] duration-500 ease-[var(--ease-out-expo)]"
                style={{ width: `${progress}%` }}
              />
            </span>
            <span className="num shrink-0 text-2xs text-ink-3">
              {view.done}/{challenge.days}
            </span>
          </div>

          {!entry && (
            <Tag tone="outline">The 30 days have run their course — mark the last ones or start a new one.</Tag>
          )}
        </div>
      </Panel>
    </Section>
  )
}
