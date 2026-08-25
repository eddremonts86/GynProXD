import { useMemo, useState } from 'react'
import { CaretDown, ChartLineUp, Trash } from '@phosphor-icons/react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useGym } from '../store/useGym'
import { e1rmSeries, exerciseById } from '../lib/exercises'
import { muscleMaxVolume, muscleVolume } from '../lib/muscle-volume'
import { Button, IconButton } from '../ui/Button'
import { Panel } from '../ui/Panel'
import { Stat } from '../ui/Stat'
import { FormSelect } from '../ui/FormSelect'
import { PageHeader, Section } from '../ui/PageHeader'
import { EmptyState } from '../ui/EmptyState'
import { MUSCLE_LABELS, formatLongDate, formatShortDate, pluralize } from '../lib/labels'
import { isoDaysAgo } from '../lib/dates'
import { cn } from '@/lib/utils'
import type { MuscleGroup, SetEntry } from '../lib/types'

function setVolume(s: SetEntry): number {
  return s.weight * (s.durationSec ? 1 : s.reps)
}

function describeSet(s: SetEntry): string {
  const load = s.weight > 0 ? `${s.weight}kg` : 'BW'
  const work = s.durationSec ? `${s.durationSec}s` : `${s.reps}`
  return `${load} × ${work}${s.side ? ` ${s.side}` : ''}`
}

const chartAxis = { fontSize: 11, fill: 'var(--ink-3)' }

/* Recharts widens these callback params, so adapt rather than fight the types. */
const dateLabel = (label: unknown) => formatLongDate(String(label))
const kgValue = (name: string) => (value: unknown): [string, string] => [`${value} kg`, name]
const chartTooltip = {
  background: 'var(--surface)',
  border: '1px solid var(--line)',
  borderRadius: '8px',
  fontSize: 12,
  color: 'var(--ink)',
}

export function HistoryPage() {
  const workouts = useGym((s) => s.workouts)
  const bodyweight = useGym((s) => s.bodyweight)

  const totals = useMemo(() => {
    let sets = 0
    let volume = 0
    for (const w of workouts)
      for (const e of w.exercises)
        for (const s of e.sets) {
          sets += 1
          volume += setVolume(s)
        }
    const from = isoDaysAgo(29)
    const recentDays = new Set(workouts.filter((w) => w.date >= from).map((w) => w.date))
    return { sets, volume: Math.round(volume), recentDays: recentDays.size }
  }, [workouts])

  if (workouts.length === 0) {
    return (
      <div className="flex flex-col gap-8">
        <PageHeader title="History" description="Every finished session, and what it added up to." />
        <EmptyState
          icon={<ChartLineUp size={20} />}
          title="Nothing recorded yet"
          description="Finish a session and it lands here, along with your estimated one rep max over time."
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="History" description="Every finished session, and what it added up to." />

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line md:grid-cols-4">
        <div className="bg-surface p-4">
          <Stat label="Sessions" value={workouts.length} />
        </div>
        <div className="bg-surface p-4">
          <Stat label="Sets" value={totals.sets} />
        </div>
        <div className="bg-surface p-4">
          <Stat label="Total volume" value={totals.volume.toLocaleString('en-GB')} unit="kg" />
        </div>
        <div className="bg-surface p-4">
          <Stat label="Days trained" value={totals.recentDays} hint="In the last 30 days" />
        </div>
      </div>

      <StrengthChart />
      {bodyweight.length >= 2 && <BodyweightChart />}
      <MuscleBalance />
      <SessionList />
    </div>
  )
}

function StrengthChart() {
  const workouts = useGym((s) => s.workouts)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const options = useMemo(() => {
    const counts = new Map<string, number>()
    for (const w of workouts)
      for (const e of w.exercises) counts.set(e.exerciseId, (counts.get(e.exerciseId) ?? 0) + 1)
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([id]) => ({ value: id, label: exerciseById(id)?.name ?? id }))
  }, [workouts])

  const chartId = selectedId ?? options[0]?.value ?? null
  const series = useMemo(
    () => (chartId ? e1rmSeries(workouts, chartId) : []),
    [workouts, chartId],
  )

  if (!chartId) return null

  return (
    <Section
      title="Estimated one rep max"
      action={
        options.length > 1 ? (
          <FormSelect
            value={chartId}
            onValueChange={setSelectedId}
            options={options}
            ariaLabel="Movement to chart"
            className="h-9 w-52 text-xs"
          />
        ) : undefined
      }
    >
      {series.length < 2 ? (
        <p className="rounded-lg border border-dashed border-line px-4 py-10 text-center text-sm text-ink-3">
          Log this movement in at least two sessions to see a trend.
        </p>
      ) : (
        <Panel padding="md">
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                <CartesianGrid stroke="var(--line)" strokeDasharray="2 4" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={formatShortDate}
                  tick={chartAxis}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis tick={chartAxis} axisLine={false} tickLine={false} width={44} unit="kg" />
                <Tooltip
                  contentStyle={chartTooltip}
                  labelStyle={{ color: 'var(--ink-3)', fontSize: 11 }}
                  labelFormatter={dateLabel}
                  formatter={kgValue('Estimated 1RM')}
                />
                <Line
                  type="monotone"
                  dataKey="e1rm"
                  stroke="var(--brand)"
                  strokeWidth={2}
                  dot={{ r: 2.5, fill: 'var(--brand)', strokeWidth: 0 }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-2 text-2xs text-ink-3">
            Epley estimate from your heaviest set each session. A guide, not a tested max.
          </p>
        </Panel>
      )}
    </Section>
  )
}

function BodyweightChart() {
  const bodyweight = useGym((s) => s.bodyweight)
  const series = useMemo(
    () => [...bodyweight].sort((a, b) => a.date.localeCompare(b.date)).slice(-24),
    [bodyweight],
  )

  const first = series[0]?.kg
  const last = series[series.length - 1]?.kg
  const delta = first !== undefined && last !== undefined ? Math.round((last - first) * 10) / 10 : 0

  return (
    <Section
      title="Bodyweight"
      hint={
        delta === 0
          ? 'No change over this range'
          : `${delta > 0 ? '+' : ''}${delta} kg over this range`
      }
    >
      <Panel padding="md">
        <div className="h-44 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
              <CartesianGrid stroke="var(--line)" strokeDasharray="2 4" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={formatShortDate}
                tick={chartAxis}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={chartAxis}
                axisLine={false}
                tickLine={false}
                width={44}
                domain={['auto', 'auto']}
                unit="kg"
              />
              <Tooltip
                contentStyle={chartTooltip}
                labelFormatter={dateLabel}
                formatter={kgValue('Bodyweight')}
              />
              <Line
                type="monotone"
                dataKey="kg"
                stroke="var(--ink-3)"
                strokeWidth={2}
                dot={{ r: 2.5, fill: 'var(--ink-3)', strokeWidth: 0 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Panel>
    </Section>
  )
}

function MuscleBalance() {
  const workouts = useGym((s) => s.workouts)
  const volume = useMemo(() => muscleVolume(workouts, 4), [workouts])
  const max = useMemo(() => muscleMaxVolume(volume), [volume])

  const rows = useMemo(
    () =>
      (Object.entries(volume) as [MuscleGroup, number][])
        .filter(([, v]) => v > 0)
        .sort((a, b) => b[1] - a[1]),
    [volume],
  )

  if (rows.length === 0) return null

  return (
    <Section title="Where the volume went" hint="Last 4 weeks">
      <ul className="flex flex-col">
        {rows.map(([muscle, v], i) => (
          <li
            key={muscle}
            className={cn(
              'flex items-center gap-4 py-2.5',
              i > 0 && 'border-t border-line',
            )}
          >
            <span className="w-28 shrink-0 text-sm text-ink-2">{MUSCLE_LABELS[muscle]}</span>
            <span className="flex-1">
              <span
                className="block h-1.5 rounded-full bg-brand"
                style={{ width: `${Math.max(2, Math.round((v / max) * 100))}%` }}
              />
            </span>
            <span className="num w-24 shrink-0 text-right text-sm text-ink">
              {Math.round(v).toLocaleString('en-GB')}
              <span className="ml-1 text-2xs text-ink-3">kg</span>
            </span>
          </li>
        ))}
      </ul>
    </Section>
  )
}

function SessionList() {
  const workouts = useGym((s) => s.workouts)
  const deleteWorkout = useGym((s) => s.deleteWorkout)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)

  return (
    <Section title="Sessions" hint={pluralize(workouts.length, 'session')}>
      <ul className="flex flex-col gap-2">
        {workouts.map((w) => {
          const sets = w.exercises.reduce((n, e) => n + e.sets.length, 0)
          const volume = Math.round(
            w.exercises.reduce((n, e) => n + e.sets.reduce((m, s) => m + setVolume(s), 0), 0),
          )
          const open = expanded === w.id
          return (
            <li key={w.id} className="overflow-hidden rounded-lg border border-line bg-surface">
              <div className="flex items-center gap-2 p-3 pl-4">
                <button
                  type="button"
                  onClick={() => setExpanded(open ? null : w.id)}
                  aria-expanded={open}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                >
                  <CaretDown
                    size={14}
                    weight="bold"
                    className={cn(
                      'shrink-0 text-ink-3 transition-transform duration-150',
                      open && 'rotate-180',
                    )}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-ink">
                      {formatLongDate(w.date)}
                    </span>
                    <span className="num block truncate text-2xs text-ink-3">
                      {pluralize(w.exercises.length, 'movement')}, {pluralize(sets, 'set')},{' '}
                      {volume.toLocaleString('en-GB')} kg
                    </span>
                  </span>
                </button>

                {confirmId === w.id ? (
                  <span className="flex shrink-0 items-center gap-1.5">
                    <Button size="sm" variant="ghost" onClick={() => setConfirmId(null)}>
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => {
                        deleteWorkout(w.id)
                        setConfirmId(null)
                      }}
                    >
                      Delete
                    </Button>
                  </span>
                ) : (
                  <IconButton
                    size="sm"
                    onClick={() => setConfirmId(w.id)}
                    aria-label={`Delete session from ${formatLongDate(w.date)}`}
                  >
                    <Trash size={15} />
                  </IconButton>
                )}
              </div>

              {open && (
                <ul className="divide-y divide-line border-t border-line">
                  {w.exercises.map((e) => (
                    <li key={e.exerciseId} className="px-4 py-2.5">
                      <p className="text-sm font-medium text-ink">
                        {exerciseById(e.exerciseId)?.name ?? e.exerciseId}
                      </p>
                      <p className="num mt-1 flex flex-wrap gap-1.5">
                        {e.sets.map((s, i) => (
                          <span
                            key={i}
                            className="rounded-full bg-surface-2 px-2 py-0.5 text-2xs text-ink-2"
                          >
                            {describeSet(s)}
                          </span>
                        ))}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          )
        })}
      </ul>
    </Section>
  )
}
