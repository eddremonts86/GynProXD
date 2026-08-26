import { useMemo, useState } from 'react'
import { CaretDown, ChartLineUp, Trash } from '@phosphor-icons/react'
import { Area, AreaChart, CartesianGrid, ReferenceLine, XAxis, YAxis } from 'recharts'
import { useGym } from '../store/useGym'
import { e1rmSeries, exerciseById } from '../lib/exercises'
import { muscleMaxVolume, muscleVolume } from '../lib/muscle-volume'
import { isoDaysAgo } from '../lib/dates'
import { sessionCountsByExercise, weeklyVolumeSeries, workoutTotals } from '../lib/stats'
import { Button, IconButton } from '../ui/Button'
import { Panel } from '../ui/Panel'
import { Stat } from '../ui/Stat'
import { FormSelect } from '../ui/FormSelect'
import { PageHeader, Section } from '../ui/PageHeader'
import { EmptyState } from '../ui/EmptyState'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { MUSCLE_LABELS, formatLongDate, formatShortDate, pluralize } from '../lib/labels'
import { cn } from '@/lib/utils'
import type { MuscleGroup, SetEntry } from '../lib/types'

function describeSet(s: SetEntry): string {
  const load = s.weight > 0 ? `${s.weight}kg` : 'BW'
  const work = s.durationSec ? `${s.durationSec}s` : `${s.reps}`
  return `${load} × ${work}${s.side ? ` ${s.side}` : ''}`
}

const axisTick = { fontSize: 11, fill: 'var(--ink-3)' }

/** "9.4k" style ticks so the axis never clips five-digit volumes. */
const compactKg = (v: number) => (v >= 1000 ? `${Math.round(v / 100) / 10}k` : String(v))

export function HistoryPage() {
  const workouts = useGym((s) => s.workouts)
  const bodyweight = useGym((s) => s.bodyweight)

  const totals = useMemo(() => {
    let sets = 0
    let volume = 0
    for (const w of workouts) {
      const t = workoutTotals(w)
      sets += t.sets
      volume += t.volume
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

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Panel padding="md">
          <Stat label="Sessions" value={workouts.length} />
        </Panel>
        <Panel padding="md">
          <Stat label="Sets" value={totals.sets} />
        </Panel>
        <Panel padding="md">
          <Stat label="Total volume" value={totals.volume.toLocaleString('en-GB')} unit="kg" />
        </Panel>
        <Panel padding="md">
          <Stat label="Days trained" value={totals.recentDays} hint="In the last 30 days" />
        </Panel>
      </div>

      <WeeklyVolumeChart />
      <StrengthChart />
      {bodyweight.length >= 2 && <BodyweightChart />}
      <MuscleBalance />
      <SessionList />
    </div>
  )
}

const volumeConfig = {
  volume: { label: 'Volume', color: 'var(--chart-1)' },
} satisfies ChartConfig

function WeeklyVolumeChart() {
  const workouts = useGym((s) => s.workouts)
  const series = useMemo(
    () => weeklyVolumeSeries(workouts, 12).map((p) => ({ ...p, week: formatShortDate(p.start) })),
    [workouts],
  )
  const trained = series.filter((p) => p.sessions > 0).length
  if (trained < 2) return null

  return (
    <Section title="Weekly volume" hint="Last 12 weeks">
      <Panel padding="md">
        <ChartContainer config={volumeConfig} className="h-52 w-full">
          <AreaChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="fill-volume" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-volume)" stopOpacity={0.3} />
                <stop offset="100%" stopColor="var(--color-volume)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--line)" strokeDasharray="2 4" vertical={false} />
            <XAxis dataKey="week" tick={axisTick} axisLine={false} tickLine={false} />
            <YAxis tick={axisTick} axisLine={false} tickLine={false} width={44} tickFormatter={compactKg} />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value) => [`${Number(value).toLocaleString('en-GB')} kg`, ' lifted']}
                  labelFormatter={(label) => `Week of ${label}`}
                />
              }
            />
            <Area
              type="monotone"
              dataKey="volume"
              stroke="var(--color-volume)"
              strokeWidth={2}
              fill="url(#fill-volume)"
              isAnimationActive={false}
            />
          </AreaChart>
        </ChartContainer>
      </Panel>
    </Section>
  )
}

const e1rmConfig = {
  e1rm: { label: 'Estimated 1RM', color: 'var(--chart-1)' },
} satisfies ChartConfig

function StrengthChart() {
  const workouts = useGym((s) => s.workouts)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const options = useMemo(() => {
    return [...sessionCountsByExercise(workouts).entries()]
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
            size="sm"
            className="w-52 text-xs"
          />
        ) : undefined
      }
    >
      {series.length < 2 ? (
        <p className="rounded-xl border border-dashed border-line px-4 py-10 text-center text-sm text-ink-3">
          Log this movement in at least two sessions to see a trend.
        </p>
      ) : (
        <Panel padding="md">
          <ChartContainer config={e1rmConfig} className="h-56 w-full">
            <AreaChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="fill-e1rm" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-e1rm)" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="var(--color-e1rm)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="var(--line)" strokeDasharray="2 4" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={formatShortDate}
                tick={axisTick}
                axisLine={false}
                tickLine={false}
              />
              <YAxis tick={axisTick} axisLine={false} tickLine={false} width={48} unit="kg" />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    formatter={(value) => [`${value} kg`, ' estimated']}
                    labelFormatter={(label) => formatLongDate(String(label))}
                  />
                }
              />
              <Area
                type="monotone"
                dataKey="e1rm"
                stroke="var(--color-e1rm)"
                strokeWidth={2}
                fill="url(#fill-e1rm)"
                dot={{ r: 2.5, fill: 'var(--color-e1rm)', strokeWidth: 0 }}
                activeDot={{ r: 5 }}
                isAnimationActive={false}
              />
            </AreaChart>
          </ChartContainer>
          <p className="mt-2 text-2xs text-ink-3">
            Epley estimate from your heaviest set each session. A guide, not a tested max.
          </p>
        </Panel>
      )}
    </Section>
  )
}

const weightConfig = {
  kg: { label: 'Bodyweight', color: 'var(--chart-2)' },
} satisfies ChartConfig

function BodyweightChart() {
  const bodyweight = useGym((s) => s.bodyweight)
  const targetKg = useGym((s) => {
    const newest = [...s.generatedPlans].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
    return newest?.input.targetWeightKg
  })

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
        <ChartContainer config={weightConfig} className="h-48 w-full">
          <AreaChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="fill-kg" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-kg)" stopOpacity={0.3} />
                <stop offset="100%" stopColor="var(--color-kg)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--line)" strokeDasharray="2 4" vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={formatShortDate}
              tick={axisTick}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={axisTick}
              axisLine={false}
              tickLine={false}
              width={52}
              domain={['auto', 'auto']}
              unit="kg"
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value) => [`${value} kg`, ' weighed']}
                  labelFormatter={(label) => formatLongDate(String(label))}
                />
              }
            />
            {targetKg !== undefined && (
              <ReferenceLine
                y={targetKg}
                stroke="var(--ink-3)"
                strokeDasharray="4 4"
                label={{ value: `Target ${targetKg} kg`, fill: 'var(--ink-3)', fontSize: 11, position: 'insideBottomRight' }}
              />
            )}
            <Area
              type="monotone"
              dataKey="kg"
              stroke="var(--color-kg)"
              strokeWidth={2}
              fill="url(#fill-kg)"
              dot={{ r: 2.5, fill: 'var(--color-kg)', strokeWidth: 0 }}
              isAnimationActive={false}
            />
          </AreaChart>
        </ChartContainer>
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
      <Panel padding="md">
        <ul className="flex flex-col">
          {rows.map(([muscle, v], i) => (
            <li
              key={muscle}
              className={cn('flex items-center gap-4 py-2.5', i > 0 && 'border-t border-line')}
            >
              <span className="w-28 shrink-0 text-sm text-ink-2">{MUSCLE_LABELS[muscle]}</span>
              <span className="flex-1">
                <span
                  className="block h-2 rounded-full bg-[var(--chart-1)]"
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
      </Panel>
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
      <ul className="flex flex-col gap-3">
        {workouts.map((w) => {
          const t = workoutTotals(w)
          const volume = Math.round(t.volume)
          const open = expanded === w.id
          return (
            <li key={w.id} className="overflow-hidden rounded-xl bg-surface shadow-[var(--shadow-panel)]">
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
                      {pluralize(w.exercises.length, 'movement')}, {pluralize(t.sets, 'set')},{' '}
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
