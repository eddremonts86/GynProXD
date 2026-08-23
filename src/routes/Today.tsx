import { useEffect, useMemo, useRef, useState } from 'react'
import { useGym, DAY_LABELS } from '../store/useGym'
import { exerciseById, exerciseLookup } from '../lib/exercises'
import { isPersonalRecord, suggestNext } from '../lib/progression'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { Input } from '../ui/Input'
import { PageHeader } from '../ui/PageHeader'
import { Badge } from '../ui/Badge'
import { Illustration } from '../ui/Illustration'
import type { DayOfWeek, ProgressionRule } from '../lib/types'

function weekdayToDay(d: number): DayOfWeek {
  const map: DayOfWeek[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
  return map[d] ?? 'mon'
}

export function TodayPage() {
  const activeWorkout = useGym((s) => s.activeWorkout)
  const customExercises = useGym((s) => s.customExercises)
  const plans = useGym((s) => s.plans)
  const workouts = useGym((s) => s.workouts)
  const exercises = useMemo(
    () => Array.from(exerciseLookup(customExercises).values()).sort((a, b) => a.name.localeCompare(b.name)),
    [customExercises],
  )
  const startWorkout = useGym((s) => s.startWorkout)
  const startWorkoutFromPlan = useGym((s) => s.startWorkoutFromPlan)
  const discardWorkout = useGym((s) => s.discardWorkout)
  const addSet = useGym((s) => s.addSet)
  const finishWorkout = useGym((s) => s.finishWorkout)
  const logBodyweight = useGym((s) => s.logBodyweight)

  const [selectedId, setSelectedId] = useState('')
  const [weight, setWeight] = useState('')
  const [reps, setReps] = useState('')
  const [kg, setKg] = useState('')
  const [filter, setFilter] = useState('')
  const [restLeft, setRestLeft] = useState<number | null>(null)
  const [wakeActive, setWakeActive] = useState(false)
  const wakeRef = useRef<{ release: () => Promise<void>; addEventListener: (t: string, cb: () => void) => void } | null>(null)

  const todayDay: DayOfWeek = weekdayToDay(new Date().getDay())
  const todayPlans = useMemo(() => {
    const found: { planId: string; planName: string; day: DayOfWeek; exercises: { exerciseId: string; progression: ProgressionRule }[] }[] = []
    for (const p of plans) {
      const d = p.days.find((x) => x.day === todayDay)
      if (d && d.exercises.length > 0) found.push({ planId: p.id, planName: p.name, day: todayDay, exercises: d.exercises })
    }
    return found
  }, [plans, todayDay])

  const filteredExercises = useMemo(() => {
    if (!filter.trim()) return exercises.slice(0, 80)
    const q = filter.toLowerCase()
    return exercises.filter((e) => e.name.toLowerCase().includes(q) || e.muscle.includes(q)).slice(0, 80)
  }, [exercises, filter])

  const getProgressionFor = (exerciseId: string): ProgressionRule => {
    for (const p of plans) for (const d of p.days) for (const pe of d.exercises) if (pe.exerciseId === exerciseId) return pe.progression
    return 'none'
  }

  useEffect(() => {
    if (restLeft === null) return
    if (restLeft <= 0) {
      setRestLeft(null)
      return
    }
    const id = window.setTimeout(() => setRestLeft((v) => (v === null ? null : v - 1)), 1000)
    return () => window.clearTimeout(id)
  }, [restLeft])

  useEffect(() => {
    if (!activeWorkout) {
      setRestLeft(null)
      if (wakeRef.current) {
        void wakeRef.current.release().catch(() => {})
        wakeRef.current = null
        setWakeActive(false)
      }
      return
    }
    let cancelled = false
    const req = async () => {
      try {
        const nav = navigator as unknown as { wakeLock?: { request: (t: string) => Promise<never> } }
        if (nav.wakeLock) {
          const sentinel = (await (nav.wakeLock.request as unknown as (t: string) => Promise<typeof wakeRef.current>)('screen')) as typeof wakeRef.current
          if (!cancelled && sentinel) {
            wakeRef.current = sentinel
            setWakeActive(true)
            sentinel.addEventListener('release', () => setWakeActive(false))
          } else if (sentinel) {
            await sentinel.release().catch(() => {})
          }
        }
      } catch {
        setWakeActive(false)
      }
    }
    void req()
    const onVis = () => {
      if (document.visibilityState === 'visible' && !wakeRef.current) void req()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVis)
      if (wakeRef.current) {
        void wakeRef.current.release().catch(() => {})
        wakeRef.current = null
      }
    }
  }, [activeWorkout])

  const handleAddSet = () => {
    if (!selectedId || !(Number(weight) >= 0) || !(Number(reps) > 0)) return
    const w = Number(weight)
    const r = Number(reps)
    const exerciseId = selectedId
    addSet(exerciseId, w, r)
    setReps('')
    setRestLeft(90)
  }

  const selectedExercise = selectedId ? exerciseById(selectedId) : undefined
  const selectedProgression = selectedId ? getProgressionFor(selectedId) : 'none'
  const selectedSuggestion = selectedId ? suggestNext(selectedProgression as ProgressionRule, selectedExercise, workouts) : null

  if (!activeWorkout) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          eyebrow="Forma · Today"
          title="Train, locally."
          description="Hybrid calisthenics + gym, no cloud. Your plan, your data, your form."
        />

        <Illustration variant="hero" className="h-36 w-full md:h-40" />

        {todayPlans.length > 0 && (
          <Card className="border-accent/20 bg-card">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-display text-lg leading-none text-ink">{DAY_LABELS[todayDay]} · {todayPlans[0].planName}</p>
                <p className="mt-1 text-xs tracking-wide text-muted uppercase">
                  {todayPlans[0].exercises.length} exercises · progression aware
                </p>
              </div>
              <Badge variant="accent">{DAY_LABELS[todayDay]}</Badge>
            </div>
            <ul className="mt-4 flex flex-col gap-1.5">
              {todayPlans[0].exercises.slice(0, 6).map((pe) => {
                const ex = exerciseById(pe.exerciseId)
                return (
                  <li key={pe.exerciseId} className="flex items-center justify-between rounded-[var(--radius-md)] bg-surface-2 px-3 py-2 border border-line/40">
                    <span className="truncate text-sm font-medium text-ink-soft">{ex?.name ?? pe.exerciseId}</span>
                    {pe.progression !== 'none' && <Badge variant="muted">{pe.progression}</Badge>}
                  </li>
                )
              })}
            </ul>
            <Button size="md" onClick={() => startWorkoutFromPlan(todayPlans[0].planId, todayPlans[0].day)} className="mt-4 w-full">
              Start planned workout
            </Button>
          </Card>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <h2 className="font-display text-lg text-ink">Bodyweight</h2>
            <p className="mt-1 text-sm leading-5 text-muted">Quick log — feeds progress & e1RM.</p>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                const v = Number(kg)
                if (v > 0) logBodyweight(v)
                setKg('')
              }}
              className="mt-4 flex gap-2"
            >
              <Input
                value={kg}
                onChange={(e) => setKg(e.target.value)}
                inputMode="decimal"
                placeholder="78.5"
                aria-label="Bodyweight in kg"
                className="flex-1"
              />
              <Button type="submit" disabled={!kg || Number(kg) <= 0}>
                Log
              </Button>
            </form>
          </Card>

          <Card className="flex flex-col justify-between bg-gradient-to-br from-card to-surface-2">
            <div>
              <h2 className="font-display text-lg text-ink">Ready to train?</h2>
              <p className="mt-1 text-sm leading-5 text-muted">No plan? Start empty and add as you go. Warm data, offline.</p>
            </div>
            <Button size="lg" onClick={startWorkout} className="mt-6 w-full">
              Start empty workout
            </Button>
            <p className="mt-3 text-center text-xs tracking-wide text-muted uppercase">{exercises.length} exercises · CDN images</p>
          </Card>
        </div>

        {todayPlans.length > 1 && (
          <Card>
            <h3 className="font-display text-base text-ink">Other plans for today</h3>
            <div className="mt-3 flex flex-col gap-2">
              {todayPlans.slice(1).map((tp) => (
                <div key={tp.planId} className="flex items-center justify-between rounded-[var(--radius-md)] bg-surface-2 px-3 py-2 border border-line/40">
                  <span className="text-sm text-ink-soft">{tp.planName}</span>
                  <Button size="sm" variant="secondary" onClick={() => startWorkoutFromPlan(tp.planId, tp.day)}>
                    Start
                  </Button>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    )
  }

  const logged = activeWorkout.exercises

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow={`In progress${wakeActive ? ' · screen awake' : ''}`}
        title="Workout"
        description={`${logged.length} exercise${logged.length === 1 ? '' : 's'} · ${activeWorkout.date}`}
        action={
          <Button variant="ghost" size="sm" onClick={discardWorkout}>
            Discard
          </Button>
        }
      />

      {restLeft !== null && (
        <Card className="flex items-center justify-between gap-3 border-accent/30 bg-accent-soft">
          <div>
            <p className="text-xs font-semibold tracking-widest text-accent uppercase">Rest</p>
            <p className="font-mono text-2xl font-bold tabular-nums text-ink">
              {Math.floor(restLeft / 60)}:{String(restLeft % 60).padStart(2, '0')}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => setRestLeft((v) => (v === null ? null : v + 30))}>
              +30s
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setRestLeft(null)}>
              Skip
            </Button>
          </div>
        </Card>
      )}

      {logged.length > 0 ? (
        <div className="flex flex-col gap-3">
          {logged.map((le) => {
            const ex = exerciseById(le.exerciseId)
            const rule = getProgressionFor(le.exerciseId)
            const suggestion = suggestNext(rule as ProgressionRule, ex, workouts)
            return (
              <Card key={le.exerciseId} padding="md">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-display text-base text-ink">{ex?.name ?? le.exerciseId}</p>
                    {ex && (
                      <div className="mt-1.5 flex gap-1.5">
                        <Badge>{ex.muscle}</Badge>
                        <Badge variant="muted">{ex.equipment}</Badge>
                        {rule !== 'none' && <Badge variant="accent">{rule}</Badge>}
                      </div>
                    )}
                  </div>
                  <span className="text-xs font-medium tracking-wide text-muted uppercase">{le.sets.length} sets</span>
                </div>
                {suggestion && (
                  <div className="mt-3 rounded-[var(--radius-md)] border border-accent/20 bg-accent-soft px-3 py-2">
                    <p className="text-xs font-semibold text-accent">Up next: {suggestion.weight}kg × {suggestion.reps}</p>
                    <p className="mt-0.5 text-xs leading-4 text-muted">{suggestion.reason}</p>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="mt-2 h-7 px-2 text-xs text-accent hover:bg-accent-soft"
                      onClick={() => {
                        setSelectedId(le.exerciseId)
                        setWeight(String(suggestion.weight))
                        setReps(String(suggestion.reps))
                      }}
                    >
                      Use suggestion
                    </Button>
                  </div>
                )}
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {le.sets.map((s, i) => {
                    const earlier = le.sets.slice(0, i)
                    const pr = isPersonalRecord(le.exerciseId, s, workouts, earlier)
                    return (
                      <span
                        key={`${s.weight}-${s.reps}-${i}`}
                        className={[
                          'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium border',
                          pr ? 'bg-accent text-accent-contrast border-accent' : 'bg-surface-2 text-ink-soft border-line',
                        ].join(' ')}
                      >
                        {s.weight}kg × {s.reps}
                        {pr && <span className="rounded-full bg-surface px-1 py-0.5 text-[10px] font-bold leading-none text-accent">PR</span>}
                      </span>
                    )
                  })}
                </div>
              </Card>
            )
          })}
        </div>
      ) : (
        <Card className="border-dashed bg-transparent py-10 text-center shadow-none">
          <Illustration variant="plate" className="mx-auto h-16 w-16" />
          <p className="mt-3 font-display text-base text-ink">No sets yet</p>
          <p className="mt-1 text-sm text-muted">Pick an exercise below and add your first set.</p>
        </Card>
      )}

      <Card className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <label htmlFor="exercise-filter" className="text-xs font-medium tracking-widest text-muted uppercase">
            Exercise
          </label>
          <Input
            id="exercise-filter"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter — e.g. bench, squat"
          />
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="w-full rounded-[var(--radius-md)] border border-line bg-surface px-3 py-3 text-sm text-ink-soft outline-none transition-colors focus:border-accent focus:bg-surface-2"
          >
            <option value="">Choose exercise…</option>
            {filteredExercises.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
          {selectedExercise && (
            <div className="flex gap-1.5">
              <Badge variant="accent">{selectedExercise.muscle}</Badge>
              <Badge>{selectedExercise.equipment}</Badge>
              {selectedProgression !== 'none' && <Badge variant="muted">{selectedProgression}</Badge>}
            </div>
          )}
          {selectedSuggestion && (
            <div className="rounded-[var(--radius-md)] border border-accent/20 bg-accent-soft px-3 py-2">
              <p className="text-xs font-semibold text-accent">
                Suggestion: {selectedSuggestion.weight}kg × {selectedSuggestion.reps}
              </p>
              <p className="text-xs leading-4 text-muted">{selectedSuggestion.reason}</p>
            </div>
          )}
        </div>

        <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
          <Input
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            inputMode="decimal"
            placeholder="kg"
            aria-label="Weight in kg"
          />
          <Input
            value={reps}
            onChange={(e) => setReps(e.target.value)}
            inputMode="numeric"
            placeholder="reps"
            aria-label="Reps"
          />
          <Button
            disabled={!selectedId || !(Number(weight) >= 0) || !(Number(reps) > 0)}
            onClick={handleAddSet}
            className="px-6"
          >
            Add
          </Button>
        </div>
        {selectedId && selectedSuggestion && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setWeight(String(selectedSuggestion.weight))
              setReps(String(selectedSuggestion.reps))
            }}
          >
            Fill suggestion
          </Button>
        )}
      </Card>

      <Button
        variant="secondary"
        size="lg"
        onClick={finishWorkout}
        disabled={logged.length === 0}
        className="w-full border-accent/30 text-accent hover:border-accent hover:bg-accent-soft disabled:opacity-40"
      >
        Finish workout
      </Button>
    </div>
  )
}
