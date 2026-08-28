import { useNavigate } from '@tanstack/react-router'
import { ArrowRight, CheckCircle, Mountains } from '@phosphor-icons/react'
import { motion, useReducedMotion } from 'motion/react'
import { useGym } from '../store/useGym'
import { ABOVE_THE_TREELINE } from '../data/story-treeline'
import {
  choiceIsDue,
  currentDay,
  isProgramComplete,
  resolveDay,
  type StoryDay,
  type StoryProgress,
  type TrackId,
} from '../lib/story'
import { exerciseById } from '../lib/exercises'
import { pluralize } from '../lib/labels'
import { Button, IconButton } from '../ui/Button'
import { ExerciseThumb } from '../ui/ExerciseThumb'
import { Panel } from '../ui/Panel'
import { Tag } from '../ui/Tag'
import { PageHeader, Section } from '../ui/PageHeader'
import { cn } from '@/lib/utils'

const program = ABOVE_THE_TREELINE

const WEIGHT_LABEL = {
  heavy: 'Heavy day',
  moderate: 'Steady day',
  light: 'Light day',
} as const

/**
 * A programme read one chapter at a time. The training is the story, so the
 * chapter comes first and the movements follow it; the day is not done until
 * the member says so.
 */
export function StoryPage() {
  const story = useGym((s) => s.story)
  const startStory = useGym((s) => s.startStory)

  if (!story || story.programId !== program.id) {
    return <StoryIntro onStart={() => startStory(program.id)} />
  }
  return <StoryRun progress={story} />
}

function StoryIntro({ onStart }: { onStart: () => void }) {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader title={program.name} description={program.tagline} />

      <Panel
        padding="lg"
        className="flex flex-col gap-4 lg:grid lg:grid-cols-[1fr_auto] lg:items-center lg:gap-10"
      >
        <div className="flex flex-col gap-4">
          <p className="max-w-[62ch] text-sm leading-relaxed text-ink-2">
            Thirty days walking up out of a valley, one chapter and one session a day. There are no
            rest days: a heavy day is always followed by a light one, so the streak never has to
            break. Three days in, you pick the job you do for the rest of the climb — and it
            changes both what you read and what you train.
          </p>
          <div className="flex flex-wrap gap-1.5">
            <Tag tone="outline">{pluralize(program.days.length, 'day')}</Tag>
            <Tag tone="outline">3 tracks</Tag>
            <Tag tone="outline">No rest days</Tag>
          </div>
          <div>
            <Button size="lg" onClick={onStart}>
              Start the climb
              <ArrowRight size={18} weight="bold" />
            </Button>
          </div>
        </div>
        {/* Quiet horizon glyph so the wide card does not trail into a void. */}
        <Mountains size={120} weight="thin" aria-hidden="true" className="hidden pr-4 text-line-strong lg:block" />
      </Panel>

      <Section title="The three jobs" hint="You choose on day 3">
        <ul className="grid gap-3 sm:grid-cols-3">
          {program.tracks.map((t) => (
            <li key={t.id}>
              <Panel padding="lg" className="flex h-full flex-col gap-1.5">
                <h3 className="text-base font-semibold text-ink">{t.name}</h3>
                <p className="text-sm text-ink-2">{t.blurb}</p>
                <p className="mt-auto pt-1 text-2xs text-ink-3">{t.focus}</p>
              </Panel>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  )
}

function StoryRun({ progress }: { progress: StoryProgress }) {
  const navigate = useNavigate()
  const reduceMotion = useReducedMotion()
  const leaveStory = useGym((s) => s.leaveStory)
  const chooseStoryTrack = useGym((s) => s.chooseStoryTrack)
  const toggleStoryDay = useGym((s) => s.toggleStoryDay)
  const startWorkoutFromExercises = useGym((s) => s.startWorkoutFromExercises)

  const today = currentDay(program, progress)
  const done = new Set(progress.completedDays)
  const complete = isProgramComplete(program, progress)
  const track = program.tracks.find((t) => t.id === progress.track)
  const needsChoice = choiceIsDue(program, progress)

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title={program.name}
        description={`Day ${Math.min(progress.completedDays.length + 1, program.days.length)} of ${program.totalDays}. ${done.size} done.`}
        action={
          <Button variant="ghost" size="sm" onClick={leaveStory}>
            Leave
          </Button>
        }
      />

      {track && (
        <p className="flex flex-wrap items-center gap-2 text-sm text-ink-3">
          <Tag tone="brand">{track.name}</Tag>
          {track.blurb}
        </p>
      )}

      {needsChoice && today && (
        <Section title="Pick your job" hint="This changes the rest of the climb">
          <ul className="grid gap-3 sm:grid-cols-3">
            {program.tracks.map((t) => (
              <li key={t.id}>
                <Panel padding="lg" className="flex h-full flex-col gap-1.5">
                  <h3 className="text-base font-semibold text-ink">{t.name}</h3>
                  <p className="text-sm text-ink-2">{t.blurb}</p>
                  <p className="text-2xs text-ink-3">{t.focus}</p>
                  <div className="mt-auto pt-2">
                    <Button variant="secondary" onClick={() => chooseStoryTrack(t.id as TrackId)}>
                      Take it
                    </Button>
                  </div>
                </Panel>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {complete ? (
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Panel padding="lg" className="flex flex-col gap-3">
            <h2 className="flex items-center gap-2 text-lg text-ink">
              <CheckCircle size={20} weight="fill" className="text-good" />
              You stood on it
            </h2>
            <p className="max-w-[60ch] text-sm leading-relaxed text-ink-2">
              Thirty days, valley to summit, every one of them marked. The mountain is exactly as it
              was — what changed is the person who walked out of that turning circle.
            </p>
          </Panel>
        </motion.div>
      ) : (
        today && (
          <DayCard
            day={today}
            track={progress.track}
            onStart={(ids) => {
              startWorkoutFromExercises(ids, today.weight === 'light' ? 'I' : 'II')
              void navigate({ to: '/' })
            }}
            onDone={() => toggleStoryDay(today.day)}
          />
        )
      )}

      <Section title="The climb so far" hint={`${done.size}/${program.days.length}`}>
        <ul className="flex flex-col gap-1.5">
          {program.days.map((d) => {
            const isDone = done.has(d.day)
            const isCurrent = today?.day === d.day
            return (
              <li key={d.day}>
                <button
                  type="button"
                  onClick={() => toggleStoryDay(d.day)}
                  aria-pressed={isDone}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-md border px-3 py-2.5 text-left transition-colors duration-150',
                    isDone && 'border-brand bg-brand-soft',
                    !isDone && isCurrent && 'border-brand',
                    !isDone && !isCurrent && 'border-line hover:border-line-strong',
                  )}
                >
                  <span
                    className={cn(
                      'num flex size-7 shrink-0 items-center justify-center rounded-full text-2xs font-semibold',
                      isDone ? 'bg-brand text-brand-ink' : 'bg-surface-2 text-ink-3',
                    )}
                  >
                    {d.day}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink">{d.title}</span>
                    <span className="block text-2xs text-ink-3">{WEIGHT_LABEL[d.weight]}</span>
                  </span>
                  {isDone && <CheckCircle size={16} weight="fill" className="shrink-0 text-brand" />}
                </button>
              </li>
            )
          })}
        </ul>
      </Section>
    </div>
  )
}

function DayCard({
  day,
  track,
  onStart,
  onDone,
}: {
  day: StoryDay
  track: TrackId | undefined
  onStart: (exerciseIds: string[]) => void
  onDone: () => void
}) {
  const { chapter, movements } = resolveDay(day, track)

  return (
    <Panel padding="none" className="overflow-hidden">
      <div className="flex flex-col gap-2 border-b border-line p-5">
        <span className="flex flex-wrap items-center gap-2">
          <span className="num text-2xs text-ink-3">Day {day.day}</span>
          <Tag tone={day.weight === 'heavy' ? 'brand' : 'outline'}>{WEIGHT_LABEL[day.weight]}</Tag>
        </span>
        <h2 className="text-xl text-ink">{day.title}</h2>
        <p className="max-w-[64ch] text-sm leading-relaxed text-ink-2">{chapter}</p>
      </div>

      <ul className="divide-y divide-line">
        {movements.map((m) => {
          const ex = exerciseById(m.exerciseId)
          return (
            <li key={m.exerciseId} className="flex items-center gap-3 px-5 py-3">
              {ex && <ExerciseThumb exercise={ex} size="md" />}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-ink">
                  {ex?.name ?? m.exerciseId}
                </span>
                <span className="num block text-2xs text-ink-3">{m.prescription}</span>
              </span>
            </li>
          )
        })}
      </ul>

      {day.ecNote && (
        <p className="flex items-start gap-2 border-t border-line bg-brand-soft px-5 py-3 text-2xs text-ink-2">
          <span className="font-semibold">If you have more</span> — {day.ecNote}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-line bg-surface-2 px-5 py-3">
        <Button onClick={() => onStart(movements.map((m) => m.exerciseId))}>
          Start this day
          <ArrowRight size={16} weight="bold" />
        </Button>
        <Button variant="secondary" onClick={onDone}>
          Mark it done
        </Button>
      </div>
    </Panel>
  )
}

/** Entry point from the challenges page. */
export function StoryTeaser() {
  const navigate = useNavigate()
  const story = useGym((s) => s.story)
  const done = story?.completedDays.length ?? 0

  return (
    <Panel padding="lg" className="flex flex-wrap items-center gap-4">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-surface-2 text-ink-3">
        <Mountains size={22} />
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="text-base font-semibold text-ink">{program.name}</h3>
        <p className="text-sm text-ink-3">
          {story
            ? `${done} of ${program.days.length} days done.`
            : program.tagline}
        </p>
      </div>
      <IconButton aria-label="Open the programme" onClick={() => void navigate({ to: '/story' })}>
        <ArrowRight size={18} />
      </IconButton>
    </Panel>
  )
}
