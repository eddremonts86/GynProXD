import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { motion, useReducedMotion } from 'motion/react'
import {
  ArrowRight,
  Barbell,
  CheckCircle,
  Plus,
  SkipForward,
  Timer,
  TrendUp,
} from '@phosphor-icons/react'
import { useGym } from '../store/useGym'
import { exerciseById, lastPerformance } from '../lib/exercises'
import { isPersonalRecord, suggestNext } from '../lib/progression'
import { bestE1rm } from '../lib/exercises'
import { Button, IconButton } from '../ui/Button'
import { Panel } from '../ui/Panel'
import { Tag } from '../ui/Tag'
import { Stat } from '../ui/Stat'
import { Input } from '../ui/Input'
import { NumberField } from '../ui/NumberField'
import { ExerciseThumb } from '../ui/ExerciseThumb'
import { PageHeader, Section } from '../ui/PageHeader'
import { EmptyState } from '../ui/EmptyState'
import { ExercisePicker } from '@/components/exercise-picker'
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
import { cn } from '@/lib/utils'
import type { DayOfWeek, PlannedExercise, SetEntry, WeeklyPlan, Workout } from '../lib/types'

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

function setVolume(s: SetEntry): number {
  return s.weight * (s.durationSec ? 1 : s.reps)
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
  return activeWorkout ? <ActiveSession workout={activeWorkout} /> : <TodayOverview />
}

/* -------------------------------------------------------------------------- */
/*  Idle: what am I doing today                                               */
/* -------------------------------------------------------------------------- */

function TodayOverview() {
  const navigate = useNavigate()
  const plans = useGym((s) => s.plans)
  const workouts = useGym((s) => s.workouts)
  const bodyweight = useGym((s) => s.bodyweight)
  const startWorkout = useGym((s) => s.startWorkout)
  const startWorkoutFromPlan = useGym((s) => s.startWorkoutFromPlan)
  const logBodyweight = useGym((s) => s.logBodyweight)

  const [kg, setKg] = useState('')
  const day = todayDayOfWeek()

  const scheduled = useMemo(
    () =>
      plans
        .map((p) => ({ plan: p, day: p.days.find((d) => d.day === day) }))
        .filter((x) => (x.day?.exercises.length ?? 0) > 0)
        .map((x) => ({ planId: x.plan.id, planName: x.plan.name, exercises: x.day!.exercises })),
    [plans, day],
  )

  const week = useMemo(() => {
    const from = isoDaysAgo(6)
    const recent = workouts.filter((w) => w.date >= from)
    let sets = 0
    let volume = 0
    for (const w of recent)
      for (const e of w.exercises)
        for (const s of e.sets) {
          sets += 1
          volume += setVolume(s)
        }
    return { sessions: recent.length, sets, volume: Math.round(volume) }
  }, [workouts])

  const lastWeighIn = bodyweight.length > 0 ? [...bodyweight].sort((a, b) => b.date.localeCompare(a.date))[0] : null
  const primary = scheduled[0]

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Today" description={formatLongDate(todayIso())} />

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line md:grid-cols-4">
        <div className="bg-surface p-4">
          <Stat label="Sessions this week" value={week.sessions} />
        </div>
        <div className="bg-surface p-4">
          <Stat label="Sets this week" value={week.sets} />
        </div>
        <div className="bg-surface p-4">
          <Stat label="Volume this week" value={week.volume.toLocaleString('en-GB')} unit="kg" />
        </div>
        <div className="bg-surface p-4">
          <Stat
            label="Bodyweight"
            value={lastWeighIn ? lastWeighIn.kg : '--'}
            unit={lastWeighIn ? 'kg' : undefined}
            hint={lastWeighIn ? `Logged ${formatLongDate(lastWeighIn.date)}` : 'Not logged yet'}
          />
        </div>
      </div>

      {primary ? (
        <Panel padding="none" className="overflow-hidden">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line p-5">
            <div className="flex min-w-0 flex-col gap-1">
              <h2 className="text-xl text-ink">{DAY_FULL_LABELS[day]}</h2>
              <p className="text-sm text-ink-3">
                {primary.planName} · {pluralize(primary.exercises.length, 'movement')}
              </p>
            </div>
            <Button
              size="lg"
              onClick={() => startWorkoutFromPlan(primary.planId, day)}
              className="w-full sm:w-auto"
            >
              Start session
              <ArrowRight size={18} weight="bold" />
            </Button>
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

          {scheduled.length > 1 && (
            <div className="flex flex-wrap items-center gap-2 border-t border-line bg-surface-2 px-5 py-3">
              <span className="text-2xs text-ink-3">Also scheduled today</span>
              {scheduled.slice(1).map((s) => (
                <Button
                  key={s.planId}
                  size="sm"
                  variant="secondary"
                  onClick={() => startWorkoutFromPlan(s.planId, day)}
                >
                  {s.planName}
                </Button>
              ))}
            </div>
          )}
        </Panel>
      ) : plans.length > 0 ? (
        <Panel padding="lg" className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <h2 className="text-xl text-ink">Rest day</h2>
            <p className="max-w-[52ch] text-sm text-ink-3">
              Nothing is scheduled for {DAY_FULL_LABELS[day]}. Recovery is part of the plan, but you
              can still train if you want to.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={startWorkout}>
              Start an empty session
            </Button>
            <Button variant="ghost" onClick={() => navigate({ to: '/planner' })}>
              Open planner
            </Button>
          </div>
        </Panel>
      ) : (
        <Panel padding="lg" className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <h2 className="text-xl text-ink">Start with a plan</h2>
            <p className="max-w-[52ch] text-sm text-ink-3">
              Tell Forma your goal, your weight and how much time you actually have. It works out a
              realistic timeline and builds the weeks around it.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="lg" onClick={() => navigate({ to: '/onboarding' })}>
              Build my plan
              <ArrowRight size={18} weight="bold" />
            </Button>
            <Button size="lg" variant="secondary" onClick={startWorkout}>
              Start an empty session
            </Button>
          </div>
        </Panel>
      )}

      <Section title="Bodyweight">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            const v = Number(kg)
            if (v > 0) logBodyweight(v)
            setKg('')
          }}
          className="flex items-end gap-2"
        >
          <Input
            label="Weigh in"
            value={kg}
            onChange={(e) => setKg(e.target.value)}
            inputMode="decimal"
            placeholder={lastWeighIn ? String(lastWeighIn.kg) : '78.5'}
            className="max-w-40"
          />
          <Button type="submit" disabled={!(Number(kg) > 0)}>
            Log
          </Button>
        </form>
      </Section>

      <RecentSessions />
    </div>
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
                <span className="block text-sm font-medium text-ink">{formatLongDate(w.date)}</span>
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

function ActiveSession({ workout }: { workout: Workout }) {
  const plans = useGym((s) => s.plans)
  const workouts = useGym((s) => s.workouts)
  const addSet = useGym((s) => s.addSet)
  const finishWorkout = useGym((s) => s.finishWorkout)
  const discardWorkout = useGym((s) => s.discardWorkout)

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
  const [prFlash, setPrFlash] = useState(false)
  const [confirmDiscard, setConfirmDiscard] = useState(false)

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
  const isTimed = !!options?.timed
  const isUnilateral = !!options?.unilateral
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
    Number(weight) >= 0 &&
    weight !== '' &&
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
          onFinish={finishWorkout}
          canFinish={false}
        />
        <EmptyState
          icon={<Barbell size={20} />}
          title="Empty session"
          description="Add the first movement and start logging."
          action={
            <Button onClick={() => setPickerOpen(true)}>
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
          finishWorkout()
          setRestLeft(null)
        }}
        canFinish={totals.sets > 0}
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
              {e.sets.length > 0 && (
                <span
                  className={cn(
                    'num rounded-full px-1.5 py-0.5 text-2xs',
                    active ? 'bg-brand-ink/20' : 'bg-surface-2 text-ink-3',
                  )}
                >
                  {e.sets.length}
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
          Add
        </button>
      </div>

      {/* Focus card: everything needed for the set in front of you. */}
      <Panel padding="none" className="overflow-hidden">
        <div className="flex items-start gap-4 border-b border-line p-5">
          {currentExercise && <ExerciseThumb exercise={currentExercise} size="lg" />}
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <h2 className="text-xl text-ink">{currentExercise?.name ?? current.exerciseId}</h2>
            <div className="flex flex-wrap items-center gap-1.5">
              {currentExercise && (
                <>
                  <Tag>{MUSCLE_LABELS[currentExercise.muscle]}</Tag>
                  <Tag>{EQUIPMENT_LABELS[currentExercise.equipment]}</Tag>
                </>
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
        </div>

        {suggestion && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line bg-brand-soft px-5 py-3">
            <TrendUp size={16} weight="bold" className="shrink-0 text-brand" />
            <span className="num text-sm font-semibold text-brand">
              {suggestion.weight > 0 ? `${suggestion.weight}kg` : 'Bodyweight'} × {suggestion.reps}
            </span>
            <span className="min-w-0 flex-1 text-2xs text-ink-3">{suggestion.reason}</span>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setWeight(String(suggestion.weight))
                if (isTimed) setDuration(String(Math.max(10, suggestion.reps * 3)))
                else setReps(String(suggestion.reps))
              }}
            >
              Use it
            </Button>
          </div>
        )}

        <div className="flex max-w-2xl flex-col gap-4 p-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <NumberField
              label="Weight"
              unit="kg"
              value={weight}
              onValueChange={setWeight}
              step={2.5}
              decimals={1}
              max={500}
            />
            {isTimed ? (
              <NumberField
                label="Time"
                unit="sec"
                value={duration}
                onValueChange={setDuration}
                step={5}
                min={1}
                max={3600}
              />
            ) : (
              <NumberField
                label="Reps"
                value={reps}
                onValueChange={setReps}
                step={1}
                min={1}
                max={200}
              />
            )}
          </div>

          {isUnilateral && (
            <fieldset className="flex items-center gap-2">
              <legend className="sr-only">Side</legend>
              {(['L', 'R'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSide(s)}
                  aria-pressed={side === s}
                  className={cn(
                    'h-11 flex-1 rounded-md border text-sm font-medium transition-colors duration-150',
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

          <Button size="lg" onClick={handleLogSet} disabled={!canLog} className="w-full">
            Log set
          </Button>

          {!canLog && (
            <p className="text-center text-2xs text-ink-3">
              {weight === ''
                ? 'Set a weight first. Use 0 for bodyweight movements.'
                : isTimed
                  ? 'Set how many seconds you held it.'
                  : 'Set how many reps you did.'}
            </p>
          )}

          {prFlash && (
            <motion.p
              initial={reduceMotion ? false : { opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center justify-center gap-1.5 text-sm font-medium text-good"
            >
              <CheckCircle size={16} weight="fill" />
              Personal record on this movement
            </motion.p>
          )}

          {current.sets.length > 0 && (
            <ul className="flex flex-wrap gap-1.5 border-t border-line pt-4">
              {current.sets.map((s, i) => {
                const pr = isNewRecord(current.exerciseId, s, workouts, current.sets.slice(0, i))
                return (
                  <motion.li
                    key={`${i}-${s.weight}-${s.reps}-${s.durationSec ?? 0}-${s.side ?? ''}`}
                    initial={reduceMotion ? false : { opacity: 0, scale: 0.94 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                    className={cn(
                      'num inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium',
                      pr
                        ? 'border-good/40 bg-good-soft text-good'
                        : 'border-line bg-surface-2 text-ink-2',
                    )}
                  >
                    <span className="opacity-60">{i + 1}</span>
                    {describeSet(s)}
                    {pr && <CheckCircle size={12} weight="fill" />}
                  </motion.li>
                )
              })}
            </ul>
          )}
        </div>
      </Panel>

      <SessionLog workout={workout} currentId={current.exerciseId} onSelect={selectExercise} />

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
  canFinish,
  rest,
}: {
  elapsed: number | null
  sets: number
  volume: number
  onFinish: () => void
  canFinish: boolean
  rest?: RestState | null
}) {
  return (
    <div className="sticky top-14 z-20 -mx-4 border-b border-line bg-bg/90 px-4 backdrop-blur-md md:-mx-8 md:px-8 lg:top-0">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 py-3">
        <div className="flex items-baseline gap-1.5">
          <span className="num text-2xl leading-none font-semibold text-ink">
            {elapsed === null ? '--:--' : formatClock(elapsed)}
          </span>
          <span className="text-2xs text-ink-3">elapsed</span>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="num text-lg leading-none font-semibold text-ink">{sets}</span>
          <span className="text-2xs text-ink-3">sets</span>
        </div>
        <div className="hidden items-baseline gap-1.5 sm:flex">
          <span className="num text-lg leading-none font-semibold text-ink">
            {volume.toLocaleString('en-GB')}
          </span>
          <span className="text-2xs text-ink-3">kg volume</span>
        </div>
        <Button onClick={onFinish} disabled={!canFinish} className="ml-auto">
          Finish
        </Button>
      </div>

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

function SessionLog({
  workout,
  currentId,
  onSelect,
}: {
  workout: Workout
  currentId: string
  onSelect: (id: string) => void
}) {
  const logged = workout.exercises.filter((e) => e.sets.length > 0)
  if (logged.length === 0) return null

  return (
    <Section title="Logged so far" hint={pluralize(logged.length, 'movement')}>
      <ul className="flex flex-col gap-2">
        {logged.map((e) => {
          const ex = exerciseById(e.exerciseId)
          return (
            <li key={e.exerciseId}>
              <button
                type="button"
                onClick={() => onSelect(e.exerciseId)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-md border px-4 py-3 text-left transition-colors duration-150',
                  e.exerciseId === currentId
                    ? 'border-brand/40 bg-brand-soft'
                    : 'border-line bg-surface hover:border-line-strong hover:bg-surface-2',
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink">
                    {ex?.name ?? e.exerciseId}
                  </span>
                  <span className="num mt-0.5 block truncate text-2xs text-ink-3">
                    {e.sets.map(describeSet).join('   ')}
                  </span>
                </span>
                <span className="num shrink-0 text-2xs text-ink-3">
                  {pluralize(e.sets.length, 'set')}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </Section>
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
