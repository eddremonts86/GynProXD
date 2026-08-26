import { useState } from 'react'
import { ArrowsClockwise } from '@phosphor-icons/react'
import { exerciseOfTheDay, surpriseExercise } from '../lib/daily-pick'
import { todayIso } from '../lib/dates'
import { EQUIPMENT_LABELS, MUSCLE_LABELS } from '../lib/labels'
import { Button } from '../ui/Button'
import { ExerciseThumb } from '../ui/ExerciseThumb'
import { Panel } from '../ui/Panel'
import { Tag } from '../ui/Tag'
import { Section } from '../ui/PageHeader'
import type { Exercise } from '../lib/types'

/**
 * The daily movement spotlight: date-seeded so every device shows the same
 * pick, with a reroll for the curious. It carries rest days — the card
 * renders whether or not a session is scheduled.
 */
export function ExerciseOfTheDay() {
  const [override, setOverride] = useState<Exercise | null>(null)
  const exercise = override ?? exerciseOfTheDay(todayIso())

  return (
    <Section
      title="Movement of the day"
      action={
        <Button size="sm" variant="ghost" onClick={() => setOverride(surpriseExercise())}>
          <ArrowsClockwise size={14} weight="bold" />
          Surprise me
        </Button>
      }
    >
      <Panel padding="none" className="overflow-hidden sm:flex">
        <div className="sm:w-64 sm:shrink-0">
          <ExerciseThumb
            exercise={exercise}
            size="fill"
            className="aspect-[4/3] rounded-none border-0 sm:h-full"
          />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2.5 p-5">
          <h3 className="text-xl text-ink">{exercise.name}</h3>
          <div className="flex flex-wrap gap-1.5">
            <Tag tone="brand">{MUSCLE_LABELS[exercise.muscle]}</Tag>
            <Tag tone="outline">{EQUIPMENT_LABELS[exercise.equipment]}</Tag>
          </div>
          {exercise.instructions?.[0] && (
            <p className="max-w-[52ch] text-sm leading-relaxed text-ink-3">
              {exercise.instructions[0]}
            </p>
          )}
        </div>
      </Panel>
    </Section>
  )
}
