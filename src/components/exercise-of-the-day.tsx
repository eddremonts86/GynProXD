import { useState } from 'react'
import { ArrowsClockwise } from '@phosphor-icons/react'
import { exerciseOfTheDay, surpriseExercise } from '../lib/daily-pick'
import { todayIso } from '../lib/dates'
import { EQUIPMENT_LABELS, MUSCLE_LABELS } from '../lib/labels'
import { ExerciseThumb } from '../ui/ExerciseThumb'
import { Panel } from '../ui/Panel'
import { Tag } from '../ui/Tag'
import { SECTION_ACTION, Section } from '../ui/PageHeader'
import type { Exercise } from '../lib/types'
import { cn } from '@/lib/utils'

/**
 * The daily movement spotlight: date-seeded so every device shows the same
 * pick, with a reroll for the curious. It carries rest days — the card
 * renders whether or not a session is scheduled.
 *
 * `stacked` puts the picture above the text instead of beside it, for when the
 * card shares a row rather than owning one: at a third of the page there is no
 * width left to run an image down the side.
 */
export function ExerciseOfTheDay({ stacked = false }: { stacked?: boolean }) {
  const [override, setOverride] = useState<Exercise | null>(null)
  const exercise = override ?? exerciseOfTheDay(todayIso())

  return (
    <Section
      title="Movement of the day"
      className={stacked ? 'h-full self-stretch' : undefined}
      action={
        <button
          type="button"
          className={SECTION_ACTION}
          onClick={() => setOverride(surpriseExercise())}
        >
          <ArrowsClockwise size={13} weight="bold" />
          Surprise me
        </button>
      }
    >
      <Panel
        padding="none"
        className={cn('overflow-hidden', stacked ? 'flex flex-1 flex-col' : 'sm:flex')}
      >
        <div className={stacked ? undefined : 'sm:w-64 sm:shrink-0'}>
          <ExerciseThumb
            exercise={exercise}
            size="fill"
            className={cn('aspect-[4/3] rounded-none border-0', !stacked && 'sm:h-full')}
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
