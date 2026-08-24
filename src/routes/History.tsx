import { useMemo, useState } from 'react'
import { useGym } from '../store/useGym'
import { e1rmSeries, exerciseById } from '../lib/exercises'
import { muscleMaxVolume, muscleVolume } from '../lib/muscle-volume'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { EmptyState } from '../ui/EmptyState'
import { PageHeader } from '../ui/PageHeader'
import { Illustration } from '../ui/Illustration'
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from 'recharts'

export function HistoryPage() {
  const workouts = useGym((s) => s.workouts)
  const bodyweight = useGym((s) => s.bodyweight)
  const deleteWorkout = useGym((s) => s.deleteWorkout)
  const [confirmId, setConfirmId] = useState<string | null>(null)

  const topExerciseId = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const w of workouts) for (const e of w.exercises) counts[e.exerciseId] = (counts[e.exerciseId] ?? 0) + 1
    let best: string | null = null
    let max = 0
    for (const [id, c] of Object.entries(counts)) if (c > max) { max = c; best = id }
    return best
  }, [workouts])

  const series = useMemo(() => (topExerciseId ? e1rmSeries(workouts, topExerciseId) : []), [workouts, topExerciseId])
  const topName = topExerciseId ? (exerciseById(topExerciseId)?.name ?? topExerciseId) : null
  const bwSeries = useMemo(() => [...bodyweight].sort((a, b) => a.date.localeCompare(b.date)).slice(-12), [bodyweight])
  const vol = useMemo(() => muscleVolume(workouts, 4), [workouts])
  const volMax = useMemo(() => muscleMaxVolume(vol), [vol])

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

      <Card>
        <h3 className="font-display text-base text-ink">Muscle heatmap — last 4 weeks</h3>
        <p className="text-xs tracking-wide text-muted uppercase">Volumen reps×kg · intensity = amber · {workouts.length === 0 ? 'no data yet — start training' : `${workouts.length} sessions`}</p>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {Object.entries(vol).map(([muscle, v]) => {
            const pct = workouts.length === 0 ? 0 : Math.round((v / volMax) * 100)
            return (
              <div key={muscle} className="rounded-lg border bg-card p-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium capitalize text-ink-soft">{muscle}</span>
                  <span className="font-mono text-xs text-muted">{v}</span>
                </div>
                <div className="mt-1.5 h-1.5 w-full rounded-full bg-muted">
                  <div className="h-1.5 rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                </div>
              </div>
            )
          })}
        </div>
      </Card>

      {workouts.length > 0 && topExerciseId && series.length >= 2 && (
        <Card>
          <h3 className="font-display text-base text-ink">Progreso — {topName}</h3>
          <p className="text-xs tracking-wide text-muted uppercase">e1RM estimado · {series.length} sesiones</p>
          <div className="mt-3 h-40 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" opacity={0.4} />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} width={40} />
                <Tooltip
                  contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px' }}
                  labelStyle={{ color: 'var(--muted-foreground)', fontSize: 12 }}
                />
                <Line type="monotone" dataKey="e1rm" stroke="var(--chart-1)" strokeWidth={2} dot={{ r: 2 }} activeDot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {bodyweight.length >= 2 && (
        <Card>
          <h3 className="font-display text-base text-ink">Peso corporal</h3>
          <p className="text-xs tracking-wide text-muted uppercase">Últimos {bwSeries.length} registros</p>
          <div className="mt-3 h-32 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={bwSeries}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" opacity={0.4} />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} width={40} domain={['auto', 'auto']} />
                <Tooltip contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px' }} />
                <Line type="monotone" dataKey="kg" stroke="var(--chart-2)" strokeWidth={2} dot={{ r: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {workouts.length === 0 ? (
        <EmptyState
          title="No sessions yet"
          description="Start from Today — planned or empty. Finished workouts and weigh-ins live here, local-first."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {workouts.map((w) => (
            <Card key={w.id} padding="md">
              <header className="flex items-center justify-between gap-2">
                <time className="font-display text-base text-ink">{w.date}</time>
                <div className="flex items-center gap-2">
                  <Badge variant="muted">{w.exercises.length} movements</Badge>
                  {confirmId === w.id ? (
                    <span className="flex items-center gap-1.5">
                      <Button variant="ghost" size="sm" onClick={() => setConfirmId(null)}>
                        Cancel
                      </Button>
                      <Button size="sm" onClick={() => { deleteWorkout(w.id); setConfirmId(null) }}>
                        Confirm
                      </Button>
                    </span>
                  ) : (
                    <button
                      onClick={() => setConfirmId(w.id)}
                      className="flex h-9 w-9 items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-ink-soft"
                      aria-label={`Delete workout ${w.date}`}
                      title="Delete"
                    >
                      ×
                    </button>
                  )}
                </div>
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
                            {s.durationSec ? `${s.weight}kg × ${s.durationSec}s` : `${s.weight}kg × ${s.reps}`}
                            {s.side ? ` ${s.side}` : ''}
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
    </div>
  )
}
