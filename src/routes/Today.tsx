import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { motion, useReducedMotion } from 'motion/react'
import {
  ArrowRight,
  ArrowsLeftRight,
  Barbell,
  CaretDown,
  CheckCircle,
  ListBullets,
  Plus,
  ShareNetwork,
  SkipForward,
  Timer,
  TrendUp,
  X,
} from '@phosphor-icons/react'
import { useSession } from '../store/useSession'
import { useMenus } from '../store/useMenus'
import { menuFor } from '../lib/menu'
import { useGym } from '../store/useGym'
import { bestE1rm, exerciseById, lastPerformance } from '../lib/exercises'
import { isPersonalRecord, suggestNext } from '../lib/progression'
import { Button, IconButton } from '../ui/Button'
import { Panel } from '../ui/Panel'
import { Tag } from '../ui/Tag'
import { Stat } from '../ui/Stat'
import { AuroraTile } from '../ui/AuroraTile'
import { TrendPill } from '../ui/TrendPill'
import { SparkArea } from '../ui/SparkArea'
import { NumberField } from '../ui/NumberField'
import { ExerciseThumb } from '../ui/ExerciseThumb'
import { PageHeader, Section } from '../ui/PageHeader'
import { EmptyState } from '../ui/EmptyState'
import { ExercisePicker } from '@/components/exercise-picker'
import { ExerciseOfTheDay } from '@/components/exercise-of-the-day'
import { SetPlan } from '@/components/set-plan'
import { SessionLogDialog } from '@/components/session-log-dialog'
import { MealSuggestions } from '@/components/meal-suggestions'
import { DishOfTheDay } from '@/components/dish-of-the-day'
import { GymKitchenToday } from '@/components/gym-kitchen-today'
import { FromYourGym } from '@/components/from-your-gym'
import { ChallengeToday } from '@/components/challenge-today'
import { StoryToday } from '@/components/story-today'
import { ConsistencyToday } from '@/components/consistency-today'
import { LatestRecord } from '@/components/latest-record'
import { FitnessLevel } from '@/components/fitness-level'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { useElapsedSeconds } from '@/hooks/use-elapsed'
import {
  DAY_FULL_LABELS,
  EQUIPMENT_LABELS,
  MUSCLE_LABELS,
  PROGRESSION_LABELS,
  formatClock,
  formatLongDate,
  pluralize,
} from '../lib/labels'
import { isoDaysAgo, todayIso } from '../lib/dates'
import { bmi, bodyweightDelta, rangeVolume, setVolume, weeklyVolumeSeries, workoutTotals } from '../lib/stats'
import { summarizeSession } from '../lib/session-summary'
import { testAgeDays, testIsStale } from '../lib/fitness-test'
import { alternativesFor } from '../lib/alternatives'
import { isTimedByNature, isUnilateralByNature, loadIsOptional } from '../lib/movement-shape'
import { INTENSITIES, INTENSITY_HELP, INTENSITY_SETS } from '../lib/intensity'
import {
  cardFromPlannedDay,
  cardFromWorkout,
  renderSessionCard,
  shareOrDownloadPng,
} from '../lib/session-card'
import { cn } from '@/lib/utils'
import type {
  DayOfWeek,
  Intensity,
  PlannedExercise,
  SetEntry,
  WeeklyPlan,
  Workout,
} from '../lib/types'

const REST_SECONDS = 90
const DAY_BY_INDEX: DayOfWeek[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

function todayDayOfWeek(): DayOfWeek {
  return DAY_BY_INDEX[new Date().getDay()] ?? 'mon'
}

/** A record only means something once there is a previous best to beat. */
function isNewRecord(
  exerciseId: string,
  set: SetEntry,
  workouts: Workout[],
  earlierSets: SetEntry[],
): boolean {
  if (bestE1rm(workouts, exerciseId) <= 0) return false
  return isPersonalRecord(exerciseId, set, workouts, earlierSets)
}

function describeSet(s: SetEntry): string {
  const load = s.weight > 0 ? `${s.weight}kg` : 'BW'
  const work = s.durationSec ? `${s.durationSec}s` : `${s.reps}`
  return `${load} × ${work}${s.side ? ` ${s.side}` : ''}`
}

/** A short rising tone when the countdown hits zero, so the phone can be face down. */
function playRestEndTone() {
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(760, ctx.currentTime)
    osc.frequency.setValueAtTime(1140, ctx.currentTime + 0.14)
    gain.gain.setValueAtTime(0.0001, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.4)
    osc.connect(gain).connect(ctx.destination)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.45)
    window.setTimeout(() => void ctx.close(), 600)
  } catch {
    // No audio available. The visual countdown is the primary signal anyway.
  }
}

interface Prefill {
  weight: string
  reps: string
  duration: string
}

function plannedOptionsFor(plans: WeeklyPlan[], exerciseId: string): PlannedExercise | null {
  for (const p of plans)
    for (const d of p.days) for (const pe of d.exercises) if (pe.exerciseId === exerciseId) return pe
  return null
}

/** What to put in the fields: the progression suggestion, else last time, else a sane start. */
function computePrefill(exerciseId: string, plans: WeeklyPlan[], workouts: Workout[]): Prefill {
  if (!exerciseId) return { weight: '', reps: '', duration: '' }
  const options = plannedOptionsFor(plans, exerciseId)
  const suggestion = suggestNext(
    options?.progression ?? 'none',
    exerciseById(exerciseId),
    workouts,
  )
  const last = lastPerformance(workouts, exerciseId)
  const lastSet = last?.sets[last.sets.length - 1]
  const weight = suggestion?.weight ?? lastSet?.weight

  if (options?.timed) {
    return {
      weight: weight === undefined ? '' : String(weight),
      reps: '',
      duration: String(lastSet?.durationSec ?? 30),
    }
  }
  return {
    weight: weight === undefined ? '' : String(weight),
    reps: String(suggestion?.reps ?? lastSet?.reps ?? 8),
    duration: '',
  }
}

export function TodayPage() {
  const activeWorkout = useGym((s) => s.activeWorkout)
  const [finishedId, setFinishedId] = useState<string | null>(null)
  if (activeWorkout) return <ActiveSession workout={activeWorkout} onFinished={setFinishedId} />
  return <TodayOverview finishedId={finishedId} onDismissSummary={() => setFinishedId(null)} />
}

/* -------------------------------------------------------------------------- */
/*  Idle: what am I doing today                                               */
/* -------------------------------------------------------------------------- */

function TodayOverview({
  finishedId,
  onDismissSummary,
}: {
  finishedId: string | null
  onDismissSummary: () => void
}) {
  const navigate = useNavigate()

  /* The gym's kitchen card outranks the public recipe for the food slot: it is
     the only block on this page that leads anywhere money changes hands. */
  const gymName = useSession((s) => s.gym)
  const menus = useMenus((s) => s.menus)
  const gymMenu = menuFor(menus, gymName ?? undefined)

  const plans = useGym((s) => s.plans)
  const workouts = useGym((s) => s.workouts)
  const bodyweight = useGym((s) => s.bodyweight)
  const startWorkout = useGym((s) => s.startWorkout)
  const startWorkoutFromPlan = useGym((s) => s.startWorkoutFromPlan)

  const fitnessTest = useGym((s) => s.fitnessTest)

  const [weighInOpen, setWeighInOpen] = useState(false)
  const [intensity, setIntensity] = useState<Intensity>('II')
  const day = todayDayOfWeek()

  const scheduled = useMemo(
    () =>
      plans
        .map((p) => ({ plan: p, day: p.days.find((d) => d.day === day) }))
        .filter((x) => (x.day?.exercises.length ?? 0) > 0)
        .map((x) => ({
          planId: x.plan.id,
          planName: x.plan.name,
          exercises: x.day!.exercises,
          ecNote: x.day!.ecNote,
        })),
    [plans, day],
  )

  const metrics = useMemo(() => {
    const thisWeek = rangeVolume(workouts, isoDaysAgo(6), todayIso())
    const lastWeek = rangeVolume(workouts, isoDaysAgo(13), isoDaysAgo(7))
    const recent = workouts.filter((w) => w.date >= isoDaysAgo(6))
    const sets = recent.reduce((n, w) => n + workoutTotals(w).sets, 0)
    const weekSeries = weeklyVolumeSeries(workouts, 12)
    return {
      thisWeek,
      volumeDelta: Math.round(thisWeek - lastWeek),
      hadLastWeek: lastWeek > 0,
      sessions: recent.length,
      sets,
      weeksTrained: weekSeries.filter((p) => p.sessions > 0).length,
      volumeSpark: weekSeries.map((p) => ({ value: p.volume })),
    }
  }, [workouts])

  const weightSpark = useMemo(
    () =>
      [...bodyweight]
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(-12)
        .map((e) => ({ value: e.kg })),
    [bodyweight],
  )
  const weightDelta = useMemo(() => bodyweightDelta(bodyweight, 30), [bodyweight])

  const lastWeighIn = bodyweight.length > 0 ? [...bodyweight].sort((a, b) => b.date.localeCompare(a.date))[0] : null
  const targetKg = useGym((s) => {
    const newest = [...s.generatedPlans].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
    return newest?.input.targetWeightKg
  })
  const losingIsGood =
    targetKg !== undefined && lastWeighIn ? targetKg < lastWeighIn.kg : undefined
  /* Height comes from the profile; paired with the latest weigh-in it turns the
     bodyweight tile into a live BMI without asking for anything twice. */
  const heightCm = useGym((s) => s.profileDetails?.heightCm)
  const bmiValue = lastWeighIn && heightCm ? bmi(lastWeighIn.kg, heightCm) : null
  const weightSub = lastWeighIn
    ? (targetKg !== undefined
        ? `Target ${targetKg} kg`
        : lastWeighIn.date === todayIso()
          ? 'Logged today'
          : `Logged ${formatLongDate(lastWeighIn.date)}`) +
      (bmiValue !== null ? ` · BMI ${bmiValue}` : '')
    : 'No weigh-ins yet. Your trend starts with the first one.'
  const primary = scheduled[0]
  const finished = finishedId ? (workouts.find((w) => w.id === finishedId) ?? null) : null

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Today" description={formatLongDate(todayIso())} />

      {fitnessTest && testIsStale(fitnessTest, todayIso()) && (
        <p className="flex flex-wrap items-center gap-1.5 text-2xs text-ink-3">
          <Timer size={14} />
          Your fitness test is {Math.floor(testAgeDays(fitnessTest, todayIso()) / 7)} weeks old.
          <Link to="/fitness-test" className="text-brand underline underline-offset-2">
            Retest in five minutes
          </Link>
        </p>
      )}

      {finished && (
        <FinishSummary
          workout={finished}
          earlier={workouts.filter((w) => w.id !== finished.id)}
          onDismiss={onDismissSummary}
        />
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <AuroraTile
          tone="green"
          label="Training volume, last 7 days"
          value={workouts.length > 0 ? metrics.thisWeek.toLocaleString('en-GB') : undefined}
          unit={workouts.length > 0 ? 'kg' : undefined}
          sub={
            workouts.length > 0
              ? `${pluralize(metrics.sessions, 'session')}, ${pluralize(metrics.sets, 'set')}`
              : 'Nothing logged yet. Your first session draws the baseline.'
          }
          foot={
            metrics.hadLastWeek && metrics.volumeDelta !== 0 ? (
              <TrendPill delta={metrics.volumeDelta} unit="kg" window="vs previous week" />
            ) : undefined
          }
        />
        <AuroraTile
          tone="orange"
          label="Bodyweight"
          value={lastWeighIn?.kg}
          unit={lastWeighIn ? 'kg' : undefined}
          sub={weightSub}
          foot={
            <>
              {weightDelta !== null && weightDelta !== 0 && (
                <TrendPill
                  delta={weightDelta}
                  unit="kg"
                  window="last 30 days"
                  positiveIsGood={losingIsGood === undefined ? undefined : !losingIsGood}
                />
              )}
              <button
                type="button"
                onClick={() => setWeighInOpen(true)}
                className="inline-flex h-9 items-center gap-1.5 rounded-full bg-surface px-3.5 text-xs font-medium text-ink shadow-[var(--shadow-panel)] transition-transform duration-150 active:translate-y-px"
              >
                <Plus size={14} weight="bold" />
                Log weigh-in
              </button>
            </>
          }
        />
      </div>

      {/* One surface split by hairlines rather than four floating boxes: these
          four numbers are one glance at the week, not four separate cards. */}
      <Panel padding="none">
        <div className="grid grid-cols-2 divide-x divide-y divide-line lg:grid-cols-4 lg:divide-y-0">
          <Stat
            className="p-4 md:p-5"
            label="Sessions, last 7 days"
            value={metrics.sessions}
            hint={metrics.sessions === 0 ? 'None logged' : undefined}
          />
          <Stat
            className="p-4 md:p-5"
            label="Sets, last 7 days"
            value={metrics.sets}
            hint={
              metrics.sets === 0
                ? 'None logged'
                : metrics.hadLastWeek
                  ? `${metrics.volumeDelta >= 0 ? '+' : ''}${metrics.volumeDelta} kg vs last week`
                  : undefined
            }
          />
          <Stat
            className="p-4 md:p-5"
            label="Weeks trained, last 12"
            value={`${metrics.weeksTrained}/12`}
            hint={metrics.weeksTrained === 0 ? 'Your first week starts it' : undefined}
            spark={
              metrics.weeksTrained > 0 ? (
                <SparkArea data={metrics.volumeSpark} color="var(--chart-1)" />
              ) : undefined
            }
          />
          <Stat
            className="p-4 md:p-5"
            label="Weight, 30 days"
            value={weightDelta === null ? '--' : weightDelta > 0 ? `+${weightDelta}` : weightDelta}
            unit={weightDelta === null ? undefined : 'kg'}
            hint={weightDelta === null ? 'No weigh-ins yet' : undefined}
            spark={weightSpark.length > 1 ? <SparkArea data={weightSpark} color="var(--chart-2)" /> : undefined}
          />
        </div>
      </Panel>

      <ConsistencyToday />

      {primary ? (
        <Panel padding="none" className="overflow-hidden">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line p-5">
            <div className="flex min-w-0 flex-col gap-1">
              <h2 className="text-xl text-ink">{DAY_FULL_LABELS[day]}</h2>
              <p className="text-sm text-ink-3">
                {primary.planName} · {pluralize(primary.exercises.length, 'movement')}
              </p>
            </div>
            <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto">
              <IconButton
                aria-label="Share this day as an image"
                onClick={() =>
                  void renderSessionCard(
                    cardFromPlannedDay(primary.planName, DAY_FULL_LABELS[day], primary.exercises),
                  ).then((blob) => shareOrDownloadPng(blob, `enforma-${day}.png`))
                }
              >
                <ShareNetwork size={16} />
              </IconButton>
              <IntensityPicker value={intensity} onChange={setIntensity} />
              <Button
                variant="primary"
                size="lg"
                onClick={() => startWorkoutFromPlan(primary.planId, day, intensity)}
                className="w-full sm:w-auto"
              >
                Start session
                <ArrowRight size={18} weight="bold" />
              </Button>
            </div>
          </div>

          <ul className="divide-y divide-line">
            {primary.exercises.map((pe) => {
              const ex = exerciseById(pe.exerciseId)
              const last = lastPerformance(workouts, pe.exerciseId)
              return (
                <li key={pe.exerciseId} className="flex items-center gap-3 px-5 py-3">
                  {ex && <ExerciseThumb exercise={ex} size="md" />}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">
                      {ex?.name ?? pe.exerciseId}
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-2xs text-ink-3">
                      {ex && <span>{MUSCLE_LABELS[ex.muscle]}</span>}
                      {pe.progression !== 'none' && (
                        <Tag tone="brand">{PROGRESSION_LABELS[pe.progression]}</Tag>
                      )}
                      {pe.supersetGroup && <Tag tone="neutral">Superset {pe.supersetGroup}</Tag>}
                    </p>
                  </div>
                  {last && (
                    <span className="num hidden shrink-0 text-2xs text-ink-3 sm:block">
                      Last {describeSet(last.sets[last.sets.length - 1])}
                    </span>
                  )}
                </li>
              )
            })}
          </ul>

          {primary.ecNote && (
            <p className="flex items-start gap-2 border-t border-line bg-brand-soft px-5 py-3 text-2xs text-ink-2">
              <Plus size={13} weight="bold" className="mt-0.5 shrink-0 text-brand" />
              <span>
                <span className="font-semibold">If you have more</span> — {primary.ecNote}
              </span>
            </p>
          )}

          {scheduled.length > 1 && (
            <div className="flex flex-wrap items-center gap-2 border-t border-line bg-surface-2 px-5 py-3">
              <span className="text-2xs text-ink-3">Also scheduled today</span>
              {scheduled.slice(1).map((s) => (
                <Button
                  key={s.planId}
                  size="sm"
                  variant="secondary"
                  onClick={() => startWorkoutFromPlan(s.planId, day, intensity)}
                >
                  {s.planName}
                </Button>
              ))}
            </div>
          )}
        </Panel>
      ) : null}

      {/*
        What the gym is running or selling, above everything the app gives away.
        It sits after the session panel, so the order settles itself: on a day
        with training booked the session leads and the gym follows it; on a rest
        day, where there is nothing to start, the gym leads. Two cards at most,
        only while they can still be acted on, each dismissible for good.
      */}
      <FromYourGym />

      {/* The member's other daily commitments, each present only while it is
          running: the challenge to act on, the story chapter to read. */}
      <ChallengeToday />
      <StoryToday />

      {/* Plan-aligned plates when a programme exists. */}
      <MealSuggestions />

      {/*
        The day's light cards share one row: none of them carries enough to
        justify a band of its own on a wide screen. With a session scheduled
        the call to action is gone from here — it sits above, at full width,
        because a loaded session is the one thing on this page that does earn
        the room — and the two spotlights split the row between them.
      */}
      {/*
        Three columns that read left to right as what to do, what to move and
        what to eat. Items sit to the top and take the height they need; the two
        spotlights opt back into stretching so they match each other.
      */}
      <div className="grid items-start gap-4 lg:grid-cols-3 lg:gap-6 2xl:gap-8">
        {/* The member's own column: what to do next, and where they stand.
            Together they fill a column that either one alone left half empty. */}
        <div className="flex flex-col gap-6">
          {!primary &&
            (plans.length > 0 ? (
            <Section title="Rest day">
              <Panel padding="lg" className="flex flex-col gap-4">
                <p className="text-sm text-ink-3">
                  Nothing is scheduled for {DAY_FULL_LABELS[day]}. Recovery is part of the plan, but
                  you can still train if you want to.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" onClick={startWorkout}>
                    Start an empty session
                  </Button>
                  <Button variant="ghost" onClick={() => navigate({ to: '/planner' })}>
                    Open planner
                  </Button>
                </div>
              </Panel>
            </Section>
          ) : (
            <Section title="Start with a programme">
              <Panel padding="lg" className="flex flex-col gap-4">
                <p className="text-sm text-ink-3">
                  Tell enForma your goal, your weight and how much time you actually have. It works
                  out a realistic timeline and builds the weeks around it.
                </p>
                <div className="flex flex-col gap-3">
                  <div className="flex flex-wrap gap-2">
                    <Button variant="primary" onClick={() => navigate({ to: '/onboarding' })}>
                      Design my programme
                      <ArrowRight size={18} weight="bold" />
                    </Button>
                    <Button variant="secondary" onClick={startWorkout}>
                      Start an empty session
                    </Button>
                  </div>
                  {!fitnessTest && (
                    <p className="text-2xs text-ink-3">
                      Not sure where you stand?{' '}
                      <Link to="/fitness-test" className="text-brand underline underline-offset-2">
                        Take the 5-minute fitness test
                      </Link>{' '}
                      first and the designer starts from your real level.
                    </p>
                  )}
                </div>
              </Panel>
            </Section>
          ))}
          <FitnessLevel stacked />
        </div>

        <ExerciseOfTheDay stacked />
        {gymMenu ? <GymKitchenToday stacked /> : <DishOfTheDay stacked showMenuLink />}
      </div>

      {/* Demoted, never dropped: the free plate is what brings people here. */}
      {gymMenu && <DishOfTheDay />}

      {/* Your standing: the last record and where the fitness test placed you,
          then the session history. */}
      <LatestRecord />
      <RecentSessions />

      <WeighInDialog
        open={weighInOpen}
        onOpenChange={setWeighInOpen}
        lastKg={lastWeighIn?.kg}
      />
    </div>
  )
}

function WeighInDialog({
  open,
  onOpenChange,
  lastKg,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  lastKg?: number
}) {
  const logBodyweight = useGym((s) => s.logBodyweight)

  /* Untouched means "start from the last known weight": most weigh-ins are a
     small nudge away from the previous one. Reset on close, not via effects. */
  const [draft, setDraft] = useState<string | null>(null)
  const kg = draft ?? (lastKg !== undefined ? String(lastKg) : '')
  const value = Number(kg)

  const close = (next: boolean) => {
    if (!next) setDraft(null)
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Log weigh-in</DialogTitle>
          <DialogDescription>
            Dated today. It feeds the trend on this tile and the History chart.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (value > 0) {
              logBodyweight(value)
              close(false)
            }
          }}
          className="flex flex-col gap-4"
        >
          <NumberField
            label="Bodyweight"
            unit="kg"
            value={kg}
            onValueChange={setDraft}
            step={0.1}
            decimals={1}
            min={20}
            max={400}
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => close(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={!(value > 0)}>
              Save
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/**
 * The outcome of the session just finished: duration, work done, records.
 * Motion here confirms the state change and nothing else (see DESIGN.md).
 */
function FinishSummary({
  workout,
  earlier,
  onDismiss,
}: {
  workout: Workout
  earlier: Workout[]
  onDismiss: () => void
}) {
  const reduceMotion = useReducedMotion()
  const summary = useMemo(() => summarizeSession(workout, earlier), [workout, earlier])
  const prNames = summary.prs.map((id) => exerciseById(id)?.name ?? id)

  const facts: { value: string; label: string }[] = []
  if (summary.durationMin !== null && summary.durationMin > 0)
    facts.push({ value: String(summary.durationMin), label: 'min' })
  facts.push({ value: String(summary.sets), label: summary.sets === 1 ? 'set' : 'sets' })
  if (summary.volume > 0)
    facts.push({ value: summary.volume.toLocaleString('en-GB'), label: 'kg volume' })

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 8, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
    >
      <Panel padding="lg" className="relative">
        <IconButton
          size="sm"
          onClick={onDismiss}
          aria-label="Dismiss session summary"
          className="absolute top-3 right-3"
        >
          <X size={16} weight="bold" />
        </IconButton>
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <CheckCircle size={20} weight="fill" className="text-good" />
            <h2 className="text-base font-semibold text-ink">Session finished</h2>
            {workout.intensity && (
              <Tag tone="outline">{INTENSITY_SETS[workout.intensity]} sets each</Tag>
            )}
            {workout.ec && <Tag tone="brand">Pushed hard</Tag>}
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            {facts.map((f) => (
              <span key={f.label} className="flex items-baseline gap-1.5">
                <span className="num text-lg leading-none font-semibold text-ink">{f.value}</span>
                <span className="text-2xs text-ink-3">{f.label}</span>
              </span>
            ))}
          </div>
          {prNames.length > 0 && (
            <p className="flex items-center gap-1.5 text-sm text-ink-2">
              <TrendUp size={16} weight="bold" className="shrink-0 text-good" />
              {prNames.length === 1
                ? `New record on ${prNames[0]}.`
                : `${prNames.length} new records: ${prNames.join(', ')}.`}
            </p>
          )}
          <div>
            <Button
              size="sm"
              variant="secondary"
              onClick={() =>
                void renderSessionCard(cardFromWorkout(workout)).then((blob) =>
                  shareOrDownloadPng(blob, `enforma-session-${workout.date}.png`),
                )
              }
            >
              <ShareNetwork size={14} weight="bold" />
              Share card
            </Button>
          </div>
        </div>
      </Panel>
    </motion.div>
  )
}

function RecentSessions() {
  const navigate = useNavigate()
  const workouts = useGym((s) => s.workouts)
  if (workouts.length === 0) return null

  return (
    <Section
      title="Recent sessions"
      action={
        <Button size="sm" variant="ghost" onClick={() => navigate({ to: '/history' })}>
          See all
        </Button>
      }
    >
      <ul className="flex flex-col gap-2">
        {workouts.slice(0, 3).map((w) => {
          const sets = w.exercises.reduce((n, e) => n + e.sets.length, 0)
          return (
            <li
              key={w.id}
              className="flex items-center justify-between gap-3 rounded-md border border-line bg-surface px-4 py-3"
            >
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 text-sm font-medium text-ink">
                  {formatLongDate(w.date)}
                  {w.ec && <Tag tone="brand">Pushed hard</Tag>}
                </span>
                <span className="block truncate text-2xs text-ink-3">
                  {w.exercises
                    .map((e) => exerciseById(e.exerciseId)?.name ?? e.exerciseId)
                    .slice(0, 3)
                    .join(', ')}
                </span>
              </span>
              <span className="num shrink-0 text-2xs text-ink-3">{pluralize(sets, 'set')}</span>
            </li>
          )
        })}
      </ul>
    </Section>
  )
}

/* -------------------------------------------------------------------------- */
/*  Active session                                                            */
/* -------------------------------------------------------------------------- */

function ActiveSession({
  workout,
  onFinished,
}: {
  workout: Workout
  onFinished: (id: string) => void
}) {
  const plans = useGym((s) => s.plans)
  const workouts = useGym((s) => s.workouts)
  const addSet = useGym((s) => s.addSet)
  const finishWorkout = useGym((s) => s.finishWorkout)
  const discardWorkout = useGym((s) => s.discardWorkout)
  const setSessionIntensity = useGym((s) => s.setSessionIntensity)
  const removeSet = useGym((s) => s.removeSet)

  const reduceMotion = useReducedMotion()
  const elapsed = useElapsedSeconds(workout.startedAt)

  const [currentId, setCurrentId] = useState(() => workout.exercises[0]?.exerciseId ?? '')
  const [initial] = useState(() =>
    computePrefill(workout.exercises[0]?.exerciseId ?? '', plans, workouts),
  )
  const [weight, setWeight] = useState(initial.weight)
  const [reps, setReps] = useState(initial.reps)
  const [duration, setDuration] = useState(initial.duration)
  const [side, setSide] = useState<'L' | 'R'>('L')
  const [restLeft, setRestLeft] = useState<number | null>(null)
  const [restTotal, setRestTotal] = useState(REST_SECONDS)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [swapOpen, setSwapOpen] = useState(false)
  const [prFlash, setPrFlash] = useState(false)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  /* null until the member says otherwise: the flag is derived from whether
     they went past a target, and an explicit tap pins it either way. */
  const [ecOverride, setEcOverride] = useState<boolean | null>(null)
  const [confirmEmptyFinish, setConfirmEmptyFinish] = useState(false)
  const [logOpen, setLogOpen] = useState(false)

  const plannedOptions = useCallback(
    (exerciseId: string): PlannedExercise | null => {
      for (const p of plans)
        for (const d of p.days)
          for (const pe of d.exercises) if (pe.exerciseId === exerciseId) return pe
      return null
    },
    [plans],
  )

  const current = workout.exercises.find((e) => e.exerciseId === currentId) ?? workout.exercises[0]
  const currentExercise = current ? exerciseById(current.exerciseId) : undefined
  const options = current ? plannedOptions(current.exerciseId) : null
  /* The plan can force either on; otherwise the movement's own nature
     decides, so a squat never asks which leg and a plank never asks reps. */
  const isTimed = !!options?.timed || isTimedByNature(currentExercise)
  const isUnilateral = !!options?.unilateral || isUnilateralByNature(currentExercise)
  const weightOptional = loadIsOptional(currentExercise)
  const rule = options?.progression ?? 'none'
  const suggestion = useMemo(
    () => (current ? suggestNext(rule, exerciseById(current.exerciseId), workouts) : null),
    [current, rule, workouts],
  )
  const previous = useMemo(
    () => (current ? lastPerformance(workouts, current.exerciseId) : null),
    [current, workouts],
  )

  const totals = useMemo(() => {
    let sets = 0
    let volume = 0
    for (const e of workout.exercises)
      for (const s of e.sets) {
        sets += 1
        volume += setVolume(s)
      }
    return { sets, volume: Math.round(volume) }
  }, [workout])

  /* Switching movement reloads the fields, so the next set is one tap away. */
  const selectExercise = useCallback(
    (exerciseId: string) => {
      setCurrentId(exerciseId)
      const next = computePrefill(exerciseId, plans, workouts)
      setWeight(next.weight)
      setReps(next.reps)
      setDuration(next.duration)
      setSide('L')
    },
    [plans, workouts],
  )

  /* Any movement taken past its target means the session was pushed. */
  const wentPastTarget = workout.exercises.some(
    (e) => (e.targetSets ?? 0) > 0 && e.sets.length > (e.targetSets ?? 0),
  )
  const ec = ecOverride ?? wentPastTarget

  /* Rest countdown. One timeout per tick keeps drift invisible at this scale. */
  useEffect(() => {
    if (restLeft === null) return
    const id = window.setTimeout(() => {
      setRestLeft((v) => {
        if (v === null) return null
        if (v - 1 <= 0) {
          playRestEndTone()
          return null
        }
        return v - 1
      })
    }, 1000)
    return () => window.clearTimeout(id)
  }, [restLeft])

  /* Screen wake lock, re-acquired when the tab comes back to the foreground. */
  useEffect(() => {
    let released = false
    let sentinel: { release: () => Promise<void> } | null = null

    const acquire = async () => {
      try {
        const nav = navigator as Navigator & {
          wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> }
        }
        if (!nav.wakeLock) return
        const next = await nav.wakeLock.request('screen')
        if (released) void next.release().catch(() => {})
        else sentinel = next
      } catch {
        // Denied or unsupported. Not worth telling the user about.
      }
    }

    void acquire()
    const onVisible = () => {
      if (document.visibilityState === 'visible') void acquire()
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      released = true
      document.removeEventListener('visibilitychange', onVisible)
      void sentinel?.release().catch(() => {})
    }
  }, [])

  const canLog =
    !!current &&
    (weightOptional || (weight !== '' && Number(weight) >= 0)) &&
    (weight === '' || Number(weight) >= 0) &&
    (isTimed ? Number(duration) > 0 : Number(reps) > 0)

  const handleLogSet = () => {
    if (!current || !canLog) return
    const w = Number(weight)
    const entry: SetEntry = isTimed
      ? { weight: w, reps: 1, durationSec: Number(duration), side: isUnilateral ? side : undefined }
      : { weight: w, reps: Number(reps), side: isUnilateral ? side : undefined }

    const pr = isNewRecord(current.exerciseId, entry, workouts, current.sets)
    addSet(current.exerciseId, entry.weight, entry.reps, {
      durationSec: entry.durationSec,
      side: entry.side,
    })

    if (pr) {
      setPrFlash(true)
      window.setTimeout(() => setPrFlash(false), 2600)
    }
    if (isUnilateral && side === 'L') {
      setSide('R')
      return
    }
    if (isUnilateral) setSide('L')

    /* In a superset the rest belongs to the group, not to each movement. */
    const group = options?.supersetGroup
    if (group) {
      const members = workout.exercises.filter(
        (e) => plannedOptions(e.exerciseId)?.supersetGroup === group,
      )
      const isLast = members[members.length - 1]?.exerciseId === current.exerciseId
      const next = members.find((m) => m.exerciseId !== current.exerciseId)
      if (!isLast && next) selectExercise(next.exerciseId)
      else {
        setRestTotal(REST_SECONDS)
        setRestLeft(REST_SECONDS)
      }
      return
    }
    setRestTotal(REST_SECONDS)
    setRestLeft(REST_SECONDS)
  }

  if (!current) {
    return (
      <div className="flex flex-col gap-8">
        <SessionHeader
          elapsed={elapsed}
          sets={0}
          volume={0}
          onFinish={() => setConfirmEmptyFinish(true)}
          emptyFinish
          confirmEmptyFinish={confirmEmptyFinish}
          onCancelEmptyFinish={() => setConfirmEmptyFinish(false)}
          onDiscardEmpty={() => {
            discardWorkout()
            setRestLeft(null)
          }}
          ec={ec}
          onToggleEc={() => setEcOverride(!ec)}
          autoEc={false}
          onOpenLog={() => setLogOpen(true)}
          intensity={workout.intensity ?? null}
          onIntensity={setSessionIntensity}
        />
        <EmptyState
          icon={<Barbell size={20} />}
          title="Empty session"
          description="Add the first movement and start logging."
          action={
            <Button variant="primary" onClick={() => setPickerOpen(true)}>
              <Plus size={16} weight="bold" />
              Add movement
            </Button>
          }
        />
        <SessionPicker
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          workout={workout}
          onPicked={selectExercise}
        />
        <DiscardRow
          confirm={confirmDiscard}
          setConfirm={setConfirmDiscard}
          onDiscard={() => {
            discardWorkout()
            setRestLeft(null)
          }}
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <SessionHeader
        elapsed={elapsed}
        sets={totals.sets}
        volume={totals.volume}
        onFinish={() => {
          if (totals.sets === 0) {
            setConfirmEmptyFinish(true)
            return
          }
          finishWorkout({ ec })
          onFinished(workout.id)
          setRestLeft(null)
        }}
        emptyFinish={totals.sets === 0}
        confirmEmptyFinish={confirmEmptyFinish}
        onCancelEmptyFinish={() => setConfirmEmptyFinish(false)}
        onDiscardEmpty={() => {
          discardWorkout()
          setRestLeft(null)
        }}
        ec={ec}
        onToggleEc={() => setEcOverride(!ec)}
        autoEc={ecOverride === null && wentPastTarget}
        onOpenLog={() => setLogOpen(true)}
        intensity={workout.intensity ?? null}
        onIntensity={setSessionIntensity}
        rest={
          restLeft === null
            ? null
            : {
                left: restLeft,
                total: restTotal,
                onAdd: () => {
                  setRestTotal((t) => t + 30)
                  setRestLeft((v) => (v === null ? null : v + 30))
                },
                onSkip: () => setRestLeft(null),
              }
        }
      />

      {/* Movement navigator: tap through the session instead of searching for it. */}
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:-mx-8 md:px-8">
        {workout.exercises.map((e, i) => {
          const ex = exerciseById(e.exerciseId)
          const active = e.exerciseId === current.exerciseId
          return (
            <button
              key={e.exerciseId}
              type="button"
              onClick={() => selectExercise(e.exerciseId)}
              aria-current={active ? 'true' : undefined}
              className={cn(
                'flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-3 text-xs font-medium transition-colors duration-150',
                active
                  ? 'border-brand bg-brand text-brand-ink'
                  : 'border-line bg-surface text-ink-3 hover:border-line-strong hover:text-ink',
              )}
            >
              <span className="num opacity-70">{i + 1}</span>
              <span className="max-w-40 truncate">{ex?.name ?? e.exerciseId}</span>
              {(e.sets.length > 0 || e.targetSets) && (
                <span
                  className={cn(
                    'num rounded-full px-1.5 py-0.5 text-2xs',
                    active ? 'bg-brand-ink/20' : 'bg-surface-2 text-ink-3',
                  )}
                >
                  {e.targetSets ? `${e.sets.length}/${e.targetSets}` : e.sets.length}
                </span>
              )}
            </button>
          )
        })}
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border border-dashed border-line px-3 text-xs font-medium text-ink-3 transition-colors hover:border-line-strong hover:text-ink"
        >
          <Plus size={14} weight="bold" />
          Add movement
        </button>
      </div>

      {/* Focus card: everything needed for the set in front of you. */}
      <Panel padding="none" className="overflow-hidden">
        <div className="grid grid-cols-[auto_1fr] items-start gap-x-4 gap-y-3 border-b border-line p-5 sm:grid-cols-[auto_1fr_auto]">
          {currentExercise && <ExerciseThumb exercise={currentExercise} size="lg" />}
          <div className="flex min-w-0 flex-col gap-1.5">
            <h2 className="text-xl text-ink">{currentExercise?.name ?? current.exerciseId}</h2>
            <div className="flex flex-wrap items-center gap-1.5">
              {currentExercise && (
                <>
                  <Tag>{MUSCLE_LABELS[currentExercise.muscle]}</Tag>
                  <Tag>{EQUIPMENT_LABELS[currentExercise.equipment]}</Tag>
                </>
              )}
              {current.targetSets && (
                <SetProgress done={current.sets.length} target={current.targetSets} />
              )}
              {rule !== 'none' && <Tag tone="brand">{PROGRESSION_LABELS[rule]}</Tag>}
              {options?.supersetGroup && <Tag>Superset {options.supersetGroup}</Tag>}
            </div>
            {previous && (
              <p className="num text-2xs text-ink-3">
                Last time {previous.sets.map(describeSet).join('  ')}
              </p>
            )}
          </div>
          {currentExercise && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setSwapOpen(true)}
              className="col-span-2 justify-self-start sm:col-span-1 sm:justify-self-end"
            >
              <ArrowsLeftRight size={14} />
              Swap movement
            </Button>
          )}
        </div>

        {suggestion && (
          <p className="flex items-start gap-2 border-b border-line bg-brand-soft px-5 py-2.5 text-2xs text-ink-2">
            <TrendUp size={14} weight="bold" className="mt-px shrink-0 text-brand" />
            <span>
              <span className="font-semibold">Pre-filled from your last session.</span>{' '}
              {suggestion.reason}
            </span>
          </p>
        )}

        <SetPlan
          logged={current.sets}
          targetSets={current.targetSets}
          isTimed={isTimed}
          isUnilateral={isUnilateral}
          weight={weight}
          reps={reps}
          duration={duration}
          side={side}
          onWeight={setWeight}
          onReps={setReps}
          onDuration={setDuration}
          onSide={setSide}
          canLog={canLog}
          weightOptional={weightOptional}
          hint={
            isTimed
              ? 'Set how many seconds it lasted.'
              : Number(reps) > 0
                ? 'Set a weight first.'
                : 'Set how many reps you did.'
          }
          onLog={handleLogSet}
          onUndo={(i) => removeSet(current.exerciseId, i)}
          onAddSet={() => {
            const rest = workout.exercises.filter((e) => e.exerciseId !== current.exerciseId)
            const next = rest.find((e) => (e.targetSets ?? 1) > e.sets.length) ?? rest[0]
            if (next) selectExercise(next.exerciseId)
          }}
        />

        {prFlash && (
          <motion.p
            initial={reduceMotion ? false : { opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center justify-center gap-1.5 border-t border-line py-3 text-sm font-medium text-good"
          >
            <CheckCircle size={16} weight="fill" />
            Personal record on this movement
          </motion.p>
        )}
      </Panel>

      <SessionLogDialog
        open={logOpen}
        onOpenChange={setLogOpen}
        workout={workout}
        elapsed={elapsed}
        onSelect={selectExercise}
      />

      <SessionPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        workout={workout}
        onPicked={selectExercise}
      />

      <SwapDialog
        open={swapOpen}
        onOpenChange={setSwapOpen}
        workout={workout}
        current={current}
        onSwapped={selectExercise}
      />

      <DiscardRow
        confirm={confirmDiscard}
        setConfirm={setConfirmDiscard}
        onDiscard={() => {
          discardWorkout()
          setRestLeft(null)
        }}
      />
    </div>
  )
}

/**
 * Dots for the target, then one more per set beyond it. Filling only to the
 * target left seven-of-four looking like four-of-four with an odd caption.
 */
function SetProgress({ done, target }: { done: number; target: number }) {
  const extra = Math.max(0, done - target)
  return (
    <span
      className="flex items-center gap-1.5"
      aria-label={
        extra > 0
          ? `${done} sets logged, ${extra} past the target of ${target}`
          : `${done} of ${target} target sets logged`
      }
    >
      <span className="flex items-center gap-1" aria-hidden="true">
        {Array.from({ length: target }, (_, i) => (
          <span
            key={i}
            className={cn(
              'size-2.5 rounded-full transition-colors duration-200',
              i < done ? 'bg-good' : 'bg-line',
            )}
          />
        ))}
        {Array.from({ length: extra }, (_, i) => (
          <span key={`x-${i}`} className="size-2.5 rounded-full bg-over" />
        ))}
      </span>
      <span className="num text-2xs text-ink-3">
        {extra > 0 ? `${done} sets · ${extra} extra` : `${done}/${target} sets`}
      </span>
    </span>
  )
}

function IntensityPicker({
  value,
  onChange,
  size = 'md',
}: {
  value: Intensity | null
  onChange: (i: Intensity) => void
  size?: 'sm' | 'md'
}) {
  return (
    <div role="group" aria-label="Target sets per movement" className="flex items-center gap-1.5">
      <span className="shrink-0 text-2xs text-ink-3">Sets each</span>
      {INTENSITIES.map((i) => (
        <button
          key={i}
          type="button"
          onClick={() => onChange(i)}
          aria-pressed={value === i}
          aria-label={INTENSITY_HELP[i]}
          title={INTENSITY_HELP[i]}
          className={cn(
            'num shrink-0 rounded-full border font-semibold transition-colors duration-150',
            size === 'sm' ? 'min-h-8 px-2.5 text-2xs' : 'min-h-9 px-3 text-xs',
            value === i
              ? 'border-brand bg-brand text-brand-ink'
              : 'border-line bg-surface text-ink-3 hover:border-line-strong hover:text-ink',
          )}
        >
          {INTENSITY_SETS[i]}
        </button>
      ))}
    </div>
  )
}

interface RestState {
  left: number
  total: number
  onAdd: () => void
  onSkip: () => void
}

function SessionHeader({
  elapsed,
  sets,
  volume,
  onFinish,
  emptyFinish,
  confirmEmptyFinish,
  onCancelEmptyFinish,
  onDiscardEmpty,
  ec,
  onToggleEc,
  autoEc,
  onOpenLog,
  intensity,
  onIntensity,
  rest,
}: {
  elapsed: number | null
  sets: number
  volume: number
  onFinish: () => void
  /** Nothing logged yet: finishing would throw the session away. */
  emptyFinish: boolean
  confirmEmptyFinish: boolean
  onCancelEmptyFinish: () => void
  onDiscardEmpty: () => void
  ec: boolean
  onToggleEc: () => void
  /** Turned on by going past a target rather than by a tap. */
  autoEc: boolean
  onOpenLog: () => void
  intensity: Intensity | null
  onIntensity: (i: Intensity) => void
  rest?: RestState | null
}) {
  return (
    <div className="sticky top-14 z-20 -mx-4 border-b border-line bg-bg/90 px-4 backdrop-blur-md md:-mx-8 md:px-8 lg:top-0">
      {/* Two bands rather than one wrapping row: what the session has done
          so far, then the controls that act on it. On a phone they stack in
          that order instead of stranding Finish on a line of its own. */}
      <div className="flex flex-col gap-2.5 py-3 lg:flex-row lg:items-center lg:gap-6">
        <div className="flex items-center gap-5">
          <div className="flex items-baseline gap-1.5">
            <span className="num-dot text-3xl leading-none text-ink">
              {elapsed === null ? '--:--' : formatClock(elapsed)}
            </span>
            <span className="text-2xs text-ink-3">elapsed</span>
          </div>
          {/* Finish rides with the clock on a phone: the sticky bar is scarce
              space and a full-width button would eat a third of it. */}
          <Button
            onClick={onFinish}
            variant={emptyFinish ? 'secondary' : 'primary'}
            size="sm"
            className="order-last ml-auto lg:hidden"
          >
            Finish
          </Button>
          <button
            type="button"
            onClick={onOpenLog}
            disabled={sets === 0}
            aria-label={sets === 0 ? 'No sets logged yet' : `See all ${sets} logged sets`}
            className="flex items-baseline gap-1.5 rounded-md transition-colors enabled:hover:text-ink disabled:cursor-default"
          >
            <span className="num text-lg leading-none font-semibold text-ink">{sets}</span>
            <span className="flex items-center gap-0.5 text-2xs text-ink-3">
              sets
              {sets > 0 && <CaretDown size={10} weight="bold" />}
            </span>
          </button>
          <div className="hidden items-baseline gap-1.5 sm:flex">
            <span className="num text-lg leading-none font-semibold text-ink">
              {volume.toLocaleString('en-GB')}
            </span>
            <span className="text-2xs text-ink-3">kg volume</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 lg:ml-auto">
          <IntensityPicker value={intensity} onChange={onIntensity} size="sm" />
          {sets > 0 && (
            <Button size="sm" variant="secondary" onClick={onOpenLog}>
              <ListBullets size={14} />
              All sets
            </Button>
          )}
          <button
            type="button"
            onClick={onToggleEc}
            aria-pressed={ec}
            title="Mark this session as one where you went past what the plan asked"
            className={cn(
              'flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-all duration-150 active:scale-[0.98]',
              ec
                ? 'border-brand bg-brand text-brand-ink'
                : 'border-line bg-surface text-ink-3 hover:border-line-strong hover:text-ink',
            )}
          >
            {ec ? <CheckCircle size={14} weight="fill" /> : <Plus size={14} weight="bold" />}
            Pushed hard
          </button>
          {/* Still empty: Finish stays reachable but stops looking like the
              thing to do, and pressing it explains itself below. */}
          <Button
            onClick={onFinish}
            variant={emptyFinish ? 'secondary' : 'primary'}
            className="ml-auto hidden lg:ml-0 lg:inline-flex"
          >
            Finish
          </Button>
        </div>
      </div>

      {ec && (
        <p className="flex items-center gap-1.5 pb-2.5 text-2xs text-ink-3">
          <CheckCircle size={13} weight="fill" className="shrink-0 text-brand" />
          {autoEc
            ? 'Past the target, so this counts as pushed hard.'
            : 'Saved as pushed hard when you finish.'}
        </p>
      )}

      {confirmEmptyFinish && (
        <div className="flex flex-wrap items-center gap-3 border-t border-line py-2.5">
          <p className="min-w-0 flex-1 text-2xs text-ink-2">
            Nothing is logged yet, so there is nothing to save. Finishing now just discards this
            session.
          </p>
          <Button size="sm" variant="ghost" onClick={onCancelEmptyFinish}>
            Keep training
          </Button>
          <Button size="sm" variant="danger" onClick={onDiscardEmpty}>
            Discard it
          </Button>
        </div>
      )}

      {rest && (
        <div className="flex max-w-2xl items-center gap-3 border-t border-line py-2.5">
          <Timer size={18} weight="bold" className="shrink-0 text-brand" />
          <span className="num text-lg leading-none font-semibold text-ink">
            {formatClock(rest.left)}
          </span>
          <span
            role="progressbar"
            aria-label="Rest remaining"
            aria-valuemin={0}
            aria-valuemax={rest.total}
            aria-valuenow={rest.left}
            className="h-0.5 min-w-8 flex-1 overflow-hidden rounded-full bg-line"
          >
            <span
              className="block h-full rounded-full bg-brand transition-[width] duration-1000 ease-linear"
              style={{ width: `${Math.round((rest.left / rest.total) * 100)}%` }}
            />
          </span>
          <Button size="sm" variant="secondary" onClick={rest.onAdd}>
            +30s
          </Button>
          <IconButton size="sm" onClick={rest.onSkip} aria-label="Skip rest">
            <SkipForward size={16} weight="fill" />
          </IconButton>
        </div>
      )}
    </div>
  )
}

function SessionPicker({
  open,
  onOpenChange,
  workout,
  onPicked,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  workout: Workout
  onPicked: (id: string) => void
}) {
  const addExerciseToSession = useGym((s) => s.addExerciseToSession)
  return (
    <ExercisePicker
      open={open}
      onOpenChange={onOpenChange}
      excludeIds={workout.exercises.map((e) => e.exerciseId)}
      title="Add to this session"
      description="Anything you add stays in this session only."
      onSelect={(exercise) => {
        addExerciseToSession(exercise.id)
        onPicked(exercise.id)
        onOpenChange(false)
      }}
    />
  )
}

/**
 * Same-muscle substitutes for when the rack is taken or something hurts.
 * Sets already logged are never thrown away: the old movement only leaves
 * the session if it is still empty.
 */
function SwapDialog({
  open,
  onOpenChange,
  workout,
  current,
  onSwapped,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  workout: Workout
  current: { exerciseId: string; sets: SetEntry[] }
  onSwapped: (id: string) => void
}) {
  const addExerciseToSession = useGym((s) => s.addExerciseToSession)
  const removeExerciseFromSession = useGym((s) => s.removeExerciseFromSession)
  const exercise = exerciseById(current.exerciseId)

  const alternatives = useMemo(() => {
    if (!exercise) return []
    return alternativesFor(exercise, {
      exclude: workout.exercises.map((e) => e.exerciseId),
      limit: 6,
    })
  }, [exercise, workout.exercises])

  const swapTo = (id: string) => {
    addExerciseToSession(id)
    if (current.sets.length === 0) removeExerciseFromSession(current.exerciseId)
    onSwapped(id)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Swap {exercise?.name ?? 'movement'}</DialogTitle>
          <DialogDescription>
            {exercise ? `Same ${MUSCLE_LABELS[exercise.muscle].toLowerCase()} work, different setup.` : ''}
            {current.sets.length > 0 && ' Your logged sets stay in the session.'}
          </DialogDescription>
        </DialogHeader>
        {alternatives.length === 0 ? (
          <p className="text-sm text-ink-3">
            No alternatives left for this muscle in the library.
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {alternatives.map((alt) => (
              <li key={alt.id}>
                <button
                  type="button"
                  onClick={() => swapTo(alt.id)}
                  className="flex w-full items-center gap-3 rounded-md border border-line bg-surface px-3 py-2.5 text-left transition-colors hover:border-line-strong"
                >
                  <ExerciseThumb exercise={alt} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink">{alt.name}</span>
                    <span className="block text-2xs text-ink-3">
                      {EQUIPMENT_LABELS[alt.equipment]}
                    </span>
                  </span>
                  <ArrowRight size={14} weight="bold" className="shrink-0 text-ink-3" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  )
}

function DiscardRow({
  confirm,
  setConfirm,
  onDiscard,
}: {
  confirm: boolean
  setConfirm: (v: boolean) => void
  onDiscard: () => void
}) {
  return (
    <div className="flex items-center justify-center gap-2 border-t border-line pt-6">
      {confirm ? (
        <>
          <span className="text-sm text-ink-3">Discard this session without saving?</span>
          <Button size="sm" variant="ghost" onClick={() => setConfirm(false)}>
            Keep it
          </Button>
          <Button size="sm" variant="danger" onClick={onDiscard}>
            Discard
          </Button>
        </>
      ) : (
        <Button size="sm" variant="ghost" onClick={() => setConfirm(true)}>
          Discard session
        </Button>
      )}
    </div>
  )
}
