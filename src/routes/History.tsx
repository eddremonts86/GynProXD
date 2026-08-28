import { useMemo, useState } from 'react'
import { CaretDown, ChartLineUp, ShareNetwork, Trash } from '@phosphor-icons/react'
import { Area, AreaChart, CartesianGrid, ReferenceLine, XAxis, YAxis } from 'recharts'
import { useGym } from '../store/useGym'
import { e1rmSeries, exerciseById } from '../lib/exercises'
import { muscleMaxVolume, muscleVolume } from '../lib/muscle-volume'
import { isoDaysAgo, todayIso } from '../lib/dates'
import {
  dailySetSeries,
  sessionCountsByExercise,
  weeklyVolumeSeries,
  workoutTotals,
  type CalendarDay,
} from '../lib/stats'
import { cardFromWorkout, renderSessionCard, shareOrDownloadPng } from '../lib/session-card'
import { INTENSITY_SETS } from '../lib/intensity'
import { Button, IconButton } from '../ui/Button'
import { Panel } from '../ui/Panel'
import { Tag } from '../ui/Tag'
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
import type { MuscleGroup, SetEntry, Workout } from '../lib/types'

function describeSet(s: SetEntry): string {
  const load = s.weight > 0 ? `${s.weight}kg` : 'BW'
  const work = s.durationSec ? `${s.durationSec}s` : `${s.reps}`
  return `${load} × ${work}${s.side ? ` ${s.side}` : ''}`
}

/**
 * Whole minutes of a finished session, or null before durations were tracked.
 * Sub-minute sessions round up so the row never claims "0 min".
 */
function sessionMinutes(w: Workout): number | null {
  if (!w.startedAt || !w.endedAt) return null
  const ms = Date.parse(w.endedAt) - Date.parse(w.startedAt)
  if (!Number.isFinite(ms) || ms <= 0) return null
  return Math.max(1, Math.round(ms / 60000))
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

      <ConsistencyCalendar />
      <WeeklyVolumeChart />
      <StrengthChart />
      {bodyweight.length >= 2 && <BodyweightChart />}
      <MuscleBalance />
      <SessionList />
    </div>
  )
}

const CALENDAR_WEEKS = 26
/* Blend steps toward the chart green; fraction-of-best keeps the scale honest
   whether someone logs 6 sets a day or 26. */
const CALENDAR_MIX = [35, 55, 75, 100]

function calendarTone(sets: number, best: number): string | undefined {
  if (sets <= 0 || best <= 0) return undefined
  const step = Math.min(4, Math.max(1, Math.ceil((sets / best) * 4)))
  return `color-mix(in srgb, var(--chart-1) ${CALENDAR_MIX[step - 1]}%, var(--surface-2))`
}

/** Short month label above the first column whose Monday enters a new month. */
function monthLabels(columns: CalendarDay[][]): (string | null)[] {
  let last = ''
  return columns.map((col) => {
    const month = new Date(`${col[0].date}T00:00:00`).toLocaleDateString('en-GB', {
      month: 'short',
    })
    if (month === last) return null
    last = month
    return month
  })
}

function ConsistencyCalendar() {
  const workouts = useGym((s) => s.workouts)
  const today = todayIso()

  const { columns, months, best, active } = useMemo(() => {
    const days = dailySetSeries(workouts, CALENDAR_WEEKS)
    const columns: CalendarDay[][] = []
    for (let i = 0; i < days.length; i += 7) columns.push(days.slice(i, i + 7))
    return {
      columns,
      months: monthLabels(columns),
      best: Math.max(...days.map((d) => d.sets)),
      active: days.filter((d) => d.sets > 0).length,
    }
  }, [workouts])

  return (
    <Section title="Consistency" hint={`Last ${CALENDAR_WEEKS} weeks`}>
      <Panel padding="md">
        <div
          role="img"
          aria-label={`Training calendar, last ${CALENDAR_WEEKS} weeks: trained on ${pluralize(active, 'day')}.`}
          className="overflow-x-auto"
        >
          <div aria-hidden="true" className="flex w-max gap-[3px]">
            <div className="mr-1.5 flex flex-col gap-[3px] pt-[19px]">
              {['M', '', 'W', '', 'F', '', ''].map((d, i) => (
                <span key={i} className="flex h-3 items-center text-2xs leading-none text-ink-3">
                  {d}
                </span>
              ))}
            </div>
            {columns.map((col, i) => (
              <div key={col[0].date} className="flex flex-col gap-[3px]">
                <span className="h-4 text-2xs whitespace-nowrap text-ink-3">{months[i]}</span>
                {col.map((day) => (
                  <span
                    key={day.date}
                    title={
                      day.sets > 0
                        ? `${pluralize(day.sets, 'set')} · ${formatLongDate(day.date)}`
                        : `Rest · ${formatLongDate(day.date)}`
                    }
                    className={cn(
                      'size-3 rounded-[3px] bg-surface-2',
                      day.date > today && 'invisible',
                    )}
                    style={{ background: calendarTone(day.sets, best) }}
                  />
                ))}
              </div>
            ))}
          </div>
          <div
            aria-hidden="true"
            className="mt-3 flex items-center justify-end gap-1 text-2xs text-ink-3"
          >
            Less
            <span className="size-3 rounded-[3px] bg-surface-2" />
            {CALENDAR_MIX.map((mix) => (
              <span
                key={mix}
                className="size-3 rounded-[3px]"
                style={{ background: `color-mix(in srgb, var(--chart-1) ${mix}%, var(--surface-2))` }}
              />
            ))}
            More
          </div>
        </div>
      </Panel>
    </Section>
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
        /* One point is not a trend, but saying so while showing the number
           beats an empty box that reads as "did my session save?". */
        <div className="flex flex-col items-center gap-1.5 rounded-xl border border-dashed border-line px-4 py-8 text-center">
          {series.length === 1 ? (
            <>
              <span className="num text-2xl leading-none font-semibold text-ink">
                {Math.round(series[0].e1rm)}
                <span className="ml-1 text-sm font-normal text-ink-3">kg</span>
              </span>
              <span className="num text-2xs text-ink-3">{formatShortDate(series[0].date)}</span>
              <span className="text-sm text-ink-3">One session. One more draws the trend.</span>
            </>
          ) : (
            <span className="text-sm text-ink-3">
              Log this movement in at least two sessions to see a trend.
            </span>
          )}
        </div>
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
                    <span className="flex items-center gap-1.5 text-sm font-medium text-ink">
                      {formatLongDate(w.date)}
                      {w.intensity && (
                        <Tag tone="outline">{INTENSITY_SETS[w.intensity]} sets each</Tag>
                      )}
                      {w.ec && <Tag tone="brand">Pushed hard</Tag>}
                    </span>
                    <span className="num block truncate text-2xs text-ink-3">
                      {pluralize(w.exercises.length, 'movement')}, {pluralize(t.sets, 'set')},{' '}
                      {volume.toLocaleString('en-GB')} kg
                      {sessionMinutes(w) !== null && ` · ${sessionMinutes(w)} min`}
                    </span>
                  </span>
                </button>

                <IconButton
                  size="sm"
                  aria-label={`Share the session from ${formatLongDate(w.date)} as an image`}
                  onClick={() =>
                    void renderSessionCard(cardFromWorkout(w)).then((blob) =>
                      shareOrDownloadPng(blob, `enforma-session-${w.date}.png`),
                    )
                  }
                >
                  <ShareNetwork size={15} />
                </IconButton>

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
