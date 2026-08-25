import { useMemo, useState } from 'react'
import { useNavigate, useParams } from '@tanstack/react-router'
import { ArrowRight, CaretLeft, CaretRight, DownloadSimple, Trash, Warning } from '@phosphor-icons/react'
import { useGym } from '../store/useGym'
import { exerciseById } from '../lib/exercises'
import { Button, IconButton } from '../ui/Button'
import { Panel } from '../ui/Panel'
import { Tag } from '../ui/Tag'
import { Stat } from '../ui/Stat'
import { PageHeader, Section } from '../ui/PageHeader'
import { EmptyState } from '../ui/EmptyState'
import {
  DAY_FULL_LABELS,
  DURATION_KEYS,
  DURATION_LABELS,
  GOAL_LABELS,
  PROGRESSION_LABELS,
  formatShortDate,
  pluralize,
} from '../lib/labels'
import { todayIso } from '../lib/dates'
import { cn } from '@/lib/utils'

function isDeloadWeek(weekIndex: number): boolean {
  return (weekIndex + 1) % 4 === 0
}

export function GeneratedPlanPage() {
  const navigate = useNavigate()
  const params = useParams({ strict: false }) as { id?: string }
  const id = params.id ?? ''

  const plan = useGym((s) => s.generatedPlans.find((g) => g.id === id))
  const saveGeneratedAsPlan = useGym((s) => s.saveGeneratedAsPlan)
  const deleteGeneratedPlan = useGym((s) => s.deleteGeneratedPlan)
  const createGeneratedPlan = useGym((s) => s.createGeneratedPlan)

  const [activeWeek, setActiveWeek] = useState(0)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const today = todayIso()

  const week = useMemo(
    () => plan?.weeks[activeWeek] ?? plan?.weeks[0],
    [plan, activeWeek],
  )

  if (!plan || !week) {
    return (
      <div className="flex flex-col gap-8">
        <PageHeader title="Plan not found" />
        <EmptyState
          title="This programme no longer exists"
          description="It was deleted, or the link points at a programme from a different browser."
          action={
            <Button onClick={() => navigate({ to: '/onboarding' })}>Build a new plan</Button>
          }
        />
      </div>
    )
  }

  const save = () => {
    if (saveGeneratedAsPlan(plan.id)) void navigate({ to: '/planner' })
  }

  const exportJson = () => {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(plan, null, 2)], { type: 'application/json' }),
    )
    const a = document.createElement('a')
    a.href = url
    a.download = `forma-programme-${plan.id}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title={plan.weeklyTemplate.name}
        description={`${GOAL_LABELS[plan.input.goal]} over ${plan.weeks.length} weeks, ${plan.input.daysPerWeek} sessions a week of ${plan.input.minsPerSession} minutes.`}
        action={
          <>
            <IconButton size="md" onClick={exportJson} aria-label="Export this programme as JSON">
              <DownloadSimple size={18} />
            </IconButton>
            {confirmDelete ? (
              <>
                <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
                  Cancel
                </Button>
                <Button
                  variant="danger"
                  onClick={() => {
                    deleteGeneratedPlan(plan.id)
                    void navigate({ to: '/planner' })
                  }}
                >
                  Delete
                </Button>
              </>
            ) : (
              <IconButton
                size="md"
                onClick={() => setConfirmDelete(true)}
                aria-label="Delete this programme"
              >
                <Trash size={18} />
              </IconButton>
            )}
            <Button onClick={save}>
              Copy to planner
              <ArrowRight size={16} weight="bold" />
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line md:grid-cols-4">
        <div className="bg-surface p-4">
          <Stat label="Timeline" value={plan.estimatedMonths} unit="months" />
        </div>
        <div className="bg-surface p-4">
          <Stat label="Rate" value={plan.rateKgPerWeek} unit="kg / week" tone="brand" />
        </div>
        <div className="bg-surface p-4">
          <Stat label="Programme" value={plan.weeks.length} unit="weeks" />
        </div>
        <div className="bg-surface p-4">
          <Stat
            label="Starting weight"
            value={plan.input.weightKg}
            unit="kg"
            hint={plan.input.targetWeightKg ? `Target ${plan.input.targetWeightKg} kg` : undefined}
          />
        </div>
      </div>

      {plan.warnings.length > 0 && (
        <Panel padding="md" className="flex gap-3 border-danger/30">
          <Warning size={18} weight="fill" className="mt-0.5 shrink-0 text-danger" />
          <div className="flex flex-col gap-1">
            {plan.warnings.map((w) => (
              <p key={w} className="text-sm text-ink-2">
                {w}
              </p>
            ))}
          </div>
        </Panel>
      )}

      <Section
        title={`Week ${week.weekIndex + 1}`}
        hint={isDeloadWeek(week.weekIndex) ? 'Deload week, lighter on purpose' : undefined}
        action={
          <>
            <IconButton
              size="sm"
              disabled={activeWeek === 0}
              onClick={() => setActiveWeek((v) => Math.max(0, v - 1))}
              aria-label="Previous week"
            >
              <CaretLeft size={16} weight="bold" />
            </IconButton>
            <span className="num px-1 text-2xs text-ink-3">
              {week.weekIndex + 1} / {plan.weeks.length}
            </span>
            <IconButton
              size="sm"
              disabled={activeWeek >= plan.weeks.length - 1}
              onClick={() => setActiveWeek((v) => Math.min(plan.weeks.length - 1, v + 1))}
              aria-label="Next week"
            >
              <CaretRight size={16} weight="bold" />
            </IconButton>
          </>
        }
      >
        <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 md:-mx-8 md:px-8">
          {plan.weeks.map((w) => {
            const active = w.weekIndex === week.weekIndex
            const hasToday = w.days.some((d) => d.date === today)
            return (
              <button
                key={w.weekIndex}
                type="button"
                onClick={() => setActiveWeek(w.weekIndex)}
                aria-pressed={active}
                aria-label={`Week ${w.weekIndex + 1}${isDeloadWeek(w.weekIndex) ? ', deload' : ''}`}
                className={cn(
                  'num flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-md border px-2.5 text-xs font-medium transition-colors duration-150',
                  active
                    ? 'border-brand bg-brand text-brand-ink'
                    : isDeloadWeek(w.weekIndex)
                      ? 'border-dashed border-line bg-surface text-ink-3 hover:border-line-strong'
                      : 'border-line bg-surface text-ink-2 hover:border-line-strong',
                  hasToday && !active && 'ring-1 ring-brand',
                )}
              >
                {w.weekIndex + 1}
              </button>
            )
          })}
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {week.days.map((d) => {
            const isToday = d.date === today
            return (
              <Panel
                key={d.date}
                padding="md"
                className={cn('flex flex-col gap-3', isToday && 'border-brand/50 bg-brand-soft')}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-semibold text-ink">{DAY_FULL_LABELS[d.day]}</span>
                  <span className="num text-2xs text-ink-3">
                    {isToday ? 'Today' : formatShortDate(d.date)}
                  </span>
                </div>
                <ul className="flex flex-col gap-1.5">
                  {d.exercises.map((pe) => (
                    <li key={pe.exerciseId} className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm text-ink-2">
                        {exerciseById(pe.exerciseId)?.name ?? pe.exerciseId}
                      </span>
                      {pe.progression !== 'none' && (
                        <Tag tone="brand">{PROGRESSION_LABELS[pe.progression]}</Tag>
                      )}
                    </li>
                  ))}
                </ul>
              </Panel>
            )
          })}
        </div>
      </Section>

      {plan.milestones.length > 0 && (
        <Section title="Checkpoints" hint={pluralize(plan.milestones.length, 'checkpoint')}>
          <ul className="flex flex-wrap gap-1.5">
            {plan.milestones.map((m) => (
              <li
                key={m.week}
                className="num rounded-full border border-line bg-surface px-2.5 py-1 text-2xs text-ink-2"
              >
                Week {m.week}
                {m.weight !== undefined ? `, ${m.weight} kg` : ''}
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Try a different length">
        <div className="flex flex-wrap gap-2">
          {DURATION_KEYS.map((d) => {
            const current = d === plan.approvedDuration
            return (
              <Button
                key={d}
                variant={current ? 'primary' : 'secondary'}
                disabled={current}
                onClick={() => {
                  const newId = createGeneratedPlan(plan.input, d)
                  setActiveWeek(0)
                  void navigate({ to: '/generated/$id', params: { id: newId } })
                }}
              >
                {DURATION_LABELS[d]}
              </Button>
            )
          })}
        </div>
        <p className="text-2xs text-ink-3">
          Same details, a new calendar. This programme is kept either way.
        </p>
      </Section>
    </div>
  )
}
