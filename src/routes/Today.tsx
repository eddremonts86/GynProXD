import { useMemo, useState } from 'react'
import { useGym } from '../store/useGym'
import { exerciseById, exerciseLookup } from '../lib/exercises'

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

  if (!activeWorkout) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-bold">Today</h1>
        <section className="rounded-xl border border-line bg-card p-4">
          <h2 className="mb-2 font-semibold">Log bodyweight</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              const v = Number(kg)
              if (v > 0) logBodyweight(v)
              setKg('')
            }}
            className="flex gap-2"
          >
            <input
              value={kg}
              onChange={(e) => setKg(e.target.value)}
              inputMode="decimal"
              placeholder="kg"
              className="min-w-0 flex-1 rounded-xl border border-line bg-surface px-4 py-3 text-sm outline-none placeholder:text-zinc-600 focus:border-accent"
            />
            <button type="submit" className="rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-surface">
              Log
            </button>
          </form>
        </section>
        <button
          onClick={startWorkout}
          className="rounded-xl bg-accent px-4 py-4 text-base font-bold text-surface"
        >
          Start workout
        </button>
      </div>
    )
  }

  const logged = activeWorkout.exercises

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Workout in progress</h1>
        <button onClick={discardWorkout} className="text-sm text-zinc-500 underline">
          discard
        </button>
      </header>

      {logged.length > 0 && (
        <ul className="space-y-2">
          {logged.map((le) => (
            <li key={le.exerciseId} className="rounded-xl border border-line bg-card px-4 py-3">
              <p className="font-medium">{exerciseById(le.exerciseId)?.name}</p>
              <p className="text-sm text-zinc-400">{le.sets.map((s) => `${s.weight}×${s.reps}`).join(' · ')}</p>
            </li>
          ))}
        </ul>
      )}

      <section className="flex flex-col gap-3 rounded-xl border border-line bg-card p-4">
        <select
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          className="w-full rounded-xl border border-line bg-surface px-3 py-3 text-sm outline-none focus:border-accent"
        >
          <option value="">Choose exercise…</option>
          {exercises.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
        <div className="flex gap-2">
          <input
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            inputMode="decimal"
            placeholder="kg"
            className="min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 py-3 text-sm outline-none placeholder:text-zinc-600 focus:border-accent"
          />
          <input
            value={reps}
            onChange={(e) => setReps(e.target.value)}
            inputMode="numeric"
            placeholder="reps"
            className="min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 py-3 text-sm outline-none placeholder:text-zinc-600 focus:border-accent"
          />
          <button
            disabled={!selectedId || !(Number(weight) >= 0) || !(Number(reps) > 0)}
            onClick={() => {
              addSet(selectedId, Number(weight), Number(reps))
              setReps('')
            }}
            className="rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-surface disabled:opacity-30"
          >
            Add set
          </button>
        </div>
      </section>

      <button
        onClick={finishWorkout}
        className="rounded-xl border border-accent px-4 py-4 text-base font-bold text-accent"
      >
        Finish workout
      </button>
    </div>
  )
}
