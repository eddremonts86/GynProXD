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

  const surprise = (
    <button
      type="button"
      className={SECTION_ACTION}
      onClick={() => setOverride(surpriseExercise())}
    >
      <ArrowsClockwise size={13} weight="bold" />
      Surprise me
    </button>
  )

  return (
    /**
     * In a shared row the action moves into the card, beside the movement it
     * changes. In the header it needed 81px of a 244px column, leaving 163 for
     * a title whose one line is 155 plus a 12px gap — four pixels short, so
     * "Movement of the day" wrapped to two lines and pushed this card's picture
     * below its neighbours'. Measured, not guessed at: the fix is not a smaller
     * gap, it is that a control for the movement belongs next to the movement.
     */
    <Section title="Movement of the day" action={stacked ? undefined : surprise}>
      <Panel
        padding="none"
        className={cn('overflow-hidden', stacked ? 'flex flex-col' : 'sm:flex')}
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
          <div className="flex flex-wrap items-center gap-1.5">
            <Tag tone="brand">{MUSCLE_LABELS[exercise.muscle]}</Tag>
            <Tag tone="outline">{EQUIPMENT_LABELS[exercise.equipment]}</Tag>
            {stacked && <span className="ml-auto">{surprise}</span>}
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
