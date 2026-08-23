import { useEffect, useMemo, useRef, useState } from 'react'
import { useGym, DAY_LABELS } from '../store/useGym'
import { exerciseById, exerciseLookup } from '../lib/exercises'
import { isPersonalRecord, suggestNext } from '../lib/progression'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { Input } from '../ui/Input'
import { PageHeader } from '../ui/PageHeader'
import { Badge } from '../ui/Badge'
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
  const wakeRef = useRef<WakeLockSentinel | null>(null)

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
        const nav = navigator as unknown as { wakeLock?: { request: (t: string) => Promise<WakeLockSentinel> } }
        if (nav.wakeLock) {
          const sentinel = await nav.wakeLock.request('screen')
          if (!cancelled) {
            wakeRef.current = sentinel
            setWakeActive(true)
            sentinel.addEventListener('release', () => setWakeActive(false))
          } else {
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
    const currentSets = activeWorkout?.exercises.find((e) => e.exerciseId === exerciseId)?.sets ?? []
    const pr = isPersonalRecord(exerciseId, { weight: w, reps: r }, workouts, currentSets)
    addSet(exerciseId, w, r)
    setReps('')
    setRestLeft(90)
    if (pr) {
      setTimeout(() => {}, 0)
    }
  }

  const selectedExercise = selectedId ? exerciseById(selectedId) : undefined
  const selectedProgression = selectedId ? getProgressionFor(selectedId) : 'none'
  const selectedSuggestion = selectedId ? suggestNext(selectedProgression as ProgressionRule, selectedExercise, workouts) : null

  if (!activeWorkout) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Today"
          description="Start a workout or log your bodyweight. Everything stays on this device."
        />

        {todayPlans.length > 0 && (
          <Card className="border-accent/20 bg-accent-soft">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-zinc-100">
                  Today · {DAY_LABELS[todayDay]} {todayPlans[0].planName && `· ${todayPlans[0].planName}`}
                </h2>
                <p className="mt-1 text-xs leading-4 text-muted">
                  {todayPlans[0].exercises.length} planned exercise{todayPlans[0].exercises.length === 1 ? '' : 's'}
                </p>
              </div>
              <Badge variant="accent">{DAY_LABELS[todayDay]}</Badge>
            </div>
            <ul className="mt-3 flex flex-col gap-1.5">
              {todayPlans[0].exercises.slice(0, 6).map((pe) => {
                const ex = exerciseById(pe.exerciseId)
                return (
                  <li key={pe.exerciseId} className="flex items-center justify-between rounded-[var(--radius-md)] bg-surface px-3 py-2">
                    <span className="truncate text-sm font-medium text-zinc-200">{ex?.name ?? pe.exerciseId}</span>
                    {pe.progression !== 'none' && <Badge variant="muted">{pe.progression}</Badge>}
                  </li>
                )
              })}
            </ul>
            <Button
              size="md"
              onClick={() => startWorkoutFromPlan(todayPlans[0].planId, todayPlans[0].day)}
              className="mt-4 w-full"
            >
              Start planned workout
            </Button>
          </Card>
        )}

        <Card>
          <h2 className="text-sm font-semibold text-zinc-100">Bodyweight</h2>
          <p className="mt-1 text-xs leading-4 text-muted">Quick log — used for progress tracking.</p>
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
              placeholder="kg — e.g. 78.5"
              aria-label="Bodyweight in kg"
              className="flex-1"
            />
            <Button type="submit" disabled={!kg || Number(kg) <= 0}>
              Log
            </Button>
          </form>
        </Card>

        <Card className="flex flex-col gap-3 bg-gradient-to-br from-card to-surface-2">
          <div>
            <h2 className="text-base font-semibold text-zinc-100">Ready to train?</h2>
            <p className="mt-1 text-sm leading-5 text-muted">Start a fresh session — add exercises and log sets as you go.</p>
          </div>
          <Button size="lg" onClick={startWorkout} className="w-full">
            Start empty workout
          </Button>
          <p className="text-center text-xs text-zinc-500">{exercises.length} exercises in library</p>
        </Card>

        {todayPlans.length > 1 && (
          <Card>
            <h3 className="text-sm font-semibold text-zinc-100">Other plans for today</h3>
            <div className="mt-3 flex flex-col gap-2">
              {todayPlans.slice(1).map((tp) => (
                <div key={tp.planId} className="flex items-center justify-between rounded-[var(--radius-md)] bg-surface-2 px-3 py-2">
                  <span className="text-sm text-zinc-200">{tp.planName}</span>
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
        title="Workout in progress"
        description={`${logged.length} exercise${logged.length === 1 ? '' : 's'} · ${activeWorkout.date}${wakeActive ? ' · screen awake' : ''}`}
        action={
          <Button variant="ghost" size="sm" onClick={discardWorkout}>
            Discard
          </Button>
        }
      />

      {restLeft !== null && (
        <Card className="flex items-center justify-between gap-3 border-accent/30 bg-accent-soft">
          <div>
            <p className="text-xs font-semibold tracking-wide text-accent uppercase">Rest</p>
            <p className="text-2xl font-bold tabular-nums text-zinc-100">
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
                    <p className="text-sm font-semibold text-zinc-100">{ex?.name ?? le.exerciseId}</p>
                    {ex && (
                      <div className="mt-1.5 flex gap-1.5">
                        <Badge>{ex.muscle}</Badge>
                        <Badge variant="muted">{ex.equipment}</Badge>
                        {rule !== 'none' && <Badge variant="accent">{rule}</Badge>}
                      </div>
                    )}
                  </div>
                  <span className="text-xs font-medium text-muted">{le.sets.length} sets</span>
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
                <p className="mt-3 flex flex-wrap gap-1.5">
                  {le.sets.map((s, i) => {
                    const earlier = le.sets.slice(0, i)
                    const pr = isPersonalRecord(le.exerciseId, s, workouts, earlier)
                    return (
                      <span
                        key={`${s.weight}-${s.reps}-${i}`}
                        className={[
                          'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium',
                          pr ? 'bg-accent text-surface' : 'bg-surface-2 text-zinc-300',
                        ].join(' ')}
                      >
                        {s.weight}kg × {s.reps}
                        {pr && <span className="rounded-full bg-surface px-1 py-0.5 text-[10px] font-bold leading-none text-accent">PR</span>}
                      </span>
                    )
                  })}
                </p>
              </Card>
            )
          })}
        </div>
      ) : (
        <Card className="border-dashed bg-transparent py-8 text-center shadow-none">
          <p className="text-sm font-medium text-zinc-300">No sets yet</p>
          <p className="mt-1 text-xs text-muted">Pick an exercise below and add your first set.</p>
        </Card>
      )}

      <Card className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <label htmlFor="exercise-filter" className="text-xs font-medium tracking-wide text-muted uppercase">
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
            className="w-full rounded-[var(--radius-md)] border border-line bg-surface px-3 py-3 text-sm text-zinc-100 outline-none transition-colors focus:border-accent focus:bg-surface-2"
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
          {filter && filteredExercises.length === 0 && (
            <p className="text-xs text-muted">No matches. Try another keyword.</p>
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
