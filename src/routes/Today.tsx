import { useMemo, useState } from 'react'
import { useGym } from '../store/useGym'
import { exerciseById, exerciseLookup } from '../lib/exercises'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { Input } from '../ui/Input'
import { PageHeader } from '../ui/PageHeader'
import { Badge } from '../ui/Badge'

export function TodayPage() {
  const activeWorkout = useGym((s) => s.activeWorkout)
  const customExercises = useGym((s) => s.customExercises)
  const exercises = useMemo(
    () => Array.from(exerciseLookup(customExercises).values()).sort((a, b) => a.name.localeCompare(b.name)),
    [customExercises],
  )
  const startWorkout = useGym((s) => s.startWorkout)
  const discardWorkout = useGym((s) => s.discardWorkout)
  const addSet = useGym((s) => s.addSet)
  const finishWorkout = useGym((s) => s.finishWorkout)
  const logBodyweight = useGym((s) => s.logBodyweight)

  const [selectedId, setSelectedId] = useState('')
  const [weight, setWeight] = useState('')
  const [reps, setReps] = useState('')
  const [kg, setKg] = useState('')
  const [filter, setFilter] = useState('')

  const filteredExercises = useMemo(() => {
    if (!filter.trim()) return exercises.slice(0, 80)
    const q = filter.toLowerCase()
    return exercises.filter((e) => e.name.toLowerCase().includes(q) || e.muscle.includes(q)).slice(0, 80)
  }, [exercises, filter])

  if (!activeWorkout) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Today"
          description="Start a workout or log your bodyweight. Everything stays on this device."
        />

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
            Start workout
          </Button>
          <p className="text-center text-xs text-zinc-500">{exercises.length} exercises in library</p>
        </Card>
      </div>
    )
  }

  const logged = activeWorkout.exercises
  const selectedExercise = selectedId ? exerciseById(selectedId) : undefined

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Workout in progress"
        description={`${logged.length} exercise${logged.length === 1 ? '' : 's'} · ${activeWorkout.date}`}
        action={
          <Button variant="ghost" size="sm" onClick={discardWorkout}>
            Discard
          </Button>
        }
      />

      {logged.length > 0 ? (
        <div className="flex flex-col gap-3">
          {logged.map((le) => {
            const ex = exerciseById(le.exerciseId)
            return (
              <Card key={le.exerciseId} padding="md">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-zinc-100">{ex?.name ?? le.exerciseId}</p>
                    {ex && (
                      <div className="mt-1.5 flex gap-1.5">
                        <Badge>{ex.muscle}</Badge>
                        <Badge variant="muted">{ex.equipment}</Badge>
                      </div>
                    )}
                  </div>
                  <span className="text-xs font-medium text-muted">{le.sets.length} sets</span>
                </div>
                <p className="mt-3 flex flex-wrap gap-1.5">
                  {le.sets.map((s, i) => (
                    <span
                      key={`${s.weight}-${s.reps}-${i}`}
                      className="rounded-full bg-surface-2 px-2.5 py-1 text-xs font-medium text-zinc-300"
                    >
                      {s.weight}kg × {s.reps}
                    </span>
                  ))}
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
            onClick={() => {
              addSet(selectedId, Number(weight), Number(reps))
              setReps('')
            }}
            className="px-6"
          >
            Add
          </Button>
        </div>
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
