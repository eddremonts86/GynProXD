import { useGym } from '../store/useGym'
import { exerciseById } from '../lib/exercises'
import { Badge } from '../ui/Badge'
import { Card } from '../ui/Card'
import { EmptyState } from '../ui/EmptyState'
import { PageHeader } from '../ui/PageHeader'
import { Illustration } from '../ui/Illustration'

export function HistoryPage() {
  const workouts = useGym((s) => s.workouts)
  const bodyweight = useGym((s) => s.bodyweight)

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="Forma · History"
        title="Traces"
        description={
          workouts.length === 0
            ? 'Warm data, offline. Your completed sessions will appear here, hybrid calisthenics and barbell.'
            : `${workouts.length} session${workouts.length === 1 ? '' : 's'} · newest first · Whoop-style warm data`
        }
      />

      <Illustration variant="orb" className="h-20 w-full" />

      {workouts.length === 0 ? (
        <EmptyState
          title="No sessions yet"
          description="Start from Today — planned or empty. Finished workouts and weigh-ins live here, local-first."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {workouts.map((w) => (
            <Card key={w.id} padding="md">
              <header className="flex items-center justify-between">
                <time className="font-display text-base text-ink">{w.date}</time>
                <Badge variant="muted">{w.exercises.length} movements</Badge>
              </header>
              <ul className="mt-3 flex flex-col gap-2">
                {w.exercises.map((le) => {
                  const ex = exerciseById(le.exerciseId)
                  return (
                    <li key={le.exerciseId} className="rounded-[var(--radius-md)] bg-surface-2 px-3 py-2.5 border border-line/40">
                      <p className="font-display text-sm text-ink-soft">{ex?.name ?? le.exerciseId}</p>
                      <p className="mt-1 flex flex-wrap gap-1.5">
                        {le.sets.map((s, i) => (
                          <span
                            key={`${s.weight}-${s.reps}-${i}`}
                            className="rounded-full bg-surface px-2.5 py-1 text-xs font-medium text-ink-soft border border-line/40"
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
          <h2 className="font-display text-lg text-ink">Bodyweight</h2>
          <p className="mt-1 text-xs tracking-wide text-muted uppercase">Last {Math.min(bodyweight.length, 10)} weigh-ins · warm trend</p>
          <ul className="mt-3 divide-y divide-line/60">
            {bodyweight.slice(0, 10).map((b) => (
              <li key={`${b.date}-${b.kg}`} className="flex justify-between py-2.5 text-sm">
                <span className="font-mono text-xs tracking-wide text-muted uppercase">{b.date}</span>
                <span className="font-mono tabular-nums text-ink-soft">{b.kg} kg</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}
