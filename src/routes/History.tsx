import { useGym } from '../store/useGym'
import { exerciseById } from '../lib/exercises'

export function HistoryPage() {
  const workouts = useGym((s) => s.workouts)
  const bodyweight = useGym((s) => s.bodyweight)

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">History</h1>
      {workouts.length === 0 && (
        <p className="rounded-xl border border-line bg-card p-4 text-sm text-zinc-500">
          No workouts yet. Start one from Today.
        </p>
      )}
      {workouts.map((w) => (
        <article key={w.id} className="rounded-xl border border-line bg-card p-4">
          <header className="flex justify-between text-sm">
            <time className="text-zinc-400">{w.date}</time>
          </header>
          <ul className="mt-2 space-y-2">
            {w.exercises.map((le) => (
              <li key={le.exerciseId}>
                <p className="font-medium">{exerciseById(le.exerciseId)?.name ?? le.exerciseId}</p>
                <p className="text-sm text-zinc-400">
                  {le.sets.map((s) => `${s.weight}×${s.reps}`).join(' · ')}
                </p>
              </li>
            ))}
          </ul>
        </article>
      ))}
      {bodyweight.length > 0 && (
        <section className="rounded-xl border border-line bg-card p-4">
          <h2 className="mb-2 font-semibold">Bodyweight</h2>
          <ul className="space-y-1 text-sm text-zinc-400">
            {bodyweight.slice(0, 10).map((b) => (
              <li key={b.date} className="flex justify-between">
                <span>{b.date}</span>
                <span>{b.kg} kg</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
