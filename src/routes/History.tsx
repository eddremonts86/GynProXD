import { useGym } from '../store/useGym'
import { exerciseById } from '../lib/exercises'
import { Badge } from '../ui/Badge'
import { Card } from '../ui/Card'
import { EmptyState } from '../ui/EmptyState'
import { PageHeader } from '../ui/PageHeader'

export function HistoryPage() {
  const workouts = useGym((s) => s.workouts)
  const bodyweight = useGym((s) => s.bodyweight)

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="History"
        description={
          workouts.length === 0
            ? 'Your completed workouts will appear here.'
            : `${workouts.length} workout${workouts.length === 1 ? '' : 's'} · newest first`
        }
      />

      {workouts.length === 0 ? (
        <EmptyState
          title="No workouts yet"
          description="Start a workout from Today. Finished sessions and weigh-ins show up here."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {workouts.map((w) => (
            <Card key={w.id} padding="md">
              <header className="flex items-center justify-between">
                <time className="text-sm font-semibold text-zinc-100">{w.date}</time>
                <Badge variant="muted">{w.exercises.length} exercises</Badge>
              </header>
              <ul className="mt-3 flex flex-col gap-3">
                {w.exercises.map((le) => {
                  const ex = exerciseById(le.exerciseId)
                  return (
                    <li key={le.exerciseId} className="rounded-[var(--radius-md)] bg-surface-2 px-3 py-2.5">
                      <p className="text-sm font-medium text-zinc-100">{ex?.name ?? le.exerciseId}</p>
                      <p className="mt-1 flex flex-wrap gap-1.5">
                        {le.sets.map((s, i) => (
                          <span
                            key={`${s.weight}-${s.reps}-${i}`}
                            className="rounded-full bg-surface px-2 py-0.5 text-xs font-medium text-zinc-300"
                          >
                            {s.weight}kg × {s.reps}
                          </span>
                        ))}
                      </p>
                    </li>
                  )
                })}
              </ul>
            </Card>
          ))}
        </div>
      )}

      {bodyweight.length > 0 && (
        <Card>
          <h2 className="text-sm font-semibold text-zinc-100">Bodyweight</h2>
          <p className="mt-1 text-xs text-muted">Last {Math.min(bodyweight.length, 10)} weigh-ins</p>
          <ul className="mt-3 divide-y divide-line">
            {bodyweight.slice(0, 10).map((b) => (
              <li key={`${b.date}-${b.kg}`} className="flex justify-between py-2 text-sm">
                <span className="font-medium text-zinc-300">{b.date}</span>
                <span className="tabular-nums text-zinc-100">{b.kg} kg</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}
