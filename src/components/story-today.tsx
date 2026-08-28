import { useMemo } from 'react'
import { ArrowRight, Mountains } from '@phosphor-icons/react'
import { useNavigate } from '@tanstack/react-router'
import { useGym } from '../store/useGym'
import { ABOVE_THE_TREELINE } from '../data/story-treeline'
import { currentDay, isProgramComplete, resolveDay, type DayWeight } from '../lib/story'
import { Button } from '../ui/Button'
import { Panel } from '../ui/Panel'
import { Section } from '../ui/PageHeader'
import { Tag } from '../ui/Tag'

const WEIGHT_LABEL: Record<DayWeight, string> = {
  heavy: 'Heavy day',
  moderate: 'Steady day',
  light: 'Light day',
}

const program = ABOVE_THE_TREELINE

/**
 * The narrative programme's chapter for today, surfaced on Today so the
 * climb is one tap from home rather than a page the member has to remember
 * to open. Only present while a story is running and unfinished.
 */
export function StoryToday() {
  const story = useGym((s) => s.story)
  const navigate = useNavigate()

  const day = useMemo(() => {
    if (!story || story.programId !== program.id) return null
    if (isProgramComplete(program, story)) return null
    return currentDay(program, story)
  }, [story])

  if (!story || !day) return null
  const { chapter } = resolveDay(day, story.track)

  return (
    <Section title="The climb" hint={`Day ${day.day} of ${program.totalDays}`}>
      <Panel padding="lg" className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-xl text-ink">{day.title}</h3>
            <Tag tone={day.weight === 'heavy' ? 'brand' : 'outline'}>{WEIGHT_LABEL[day.weight]}</Tag>
          </div>
          <p className="line-clamp-2 max-w-[60ch] text-sm leading-relaxed text-ink-2">{chapter}</p>
          <div className="pt-1">
            <Button size="sm" onClick={() => void navigate({ to: '/story' })}>
              Continue the climb
              <ArrowRight size={15} weight="bold" />
            </Button>
          </div>
        </div>
        <Mountains
          size={72}
          weight="thin"
          aria-hidden="true"
          className="hidden shrink-0 text-line-strong sm:block"
        />
      </Panel>
    </Section>
  )
}
