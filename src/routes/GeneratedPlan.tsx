import { useMemo, useState } from 'react'
import { useNavigate, useParams } from '@tanstack/react-router'
import {
  ArrowRight,
  CaretDown,
  CircleNotch,
  CaretLeft,
  CaretRight,
  DownloadSimple,
  Plus,
  Sparkle,
  Trash,
  Warning,
} from '@phosphor-icons/react'
import { useGym } from '../store/useGym'
import { exerciseById } from '../lib/exercises'
import { todayIso } from '../lib/dates'
import { buildProgramme } from '../lib/ai-plan'
import { nutritionTargetFor } from '../lib/nutrition-target'
import type { RecipeSuggestion } from '../lib/recipes'
import { DayPlate } from '@/components/day-plate'
import { useDayPlates } from '../lib/use-day-plates'
import { writePlannerSelection } from '../lib/planner-selection'
import { Button, IconButton } from '../ui/Button'
import { Panel } from '../ui/Panel'
import { Tag } from '../ui/Tag'
import { AuroraTile } from '../ui/AuroraTile'
import { ExerciseThumb } from '../ui/ExerciseThumb'
import { PageHeader, Section } from '../ui/PageHeader'
import { EmptyState } from '../ui/EmptyState'
import { MovementFrames } from '@/components/movement-frames'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  DAY_FULL_LABELS,
  DURATION_KEYS,
  DURATION_LABELS,
  EQUIPMENT_LABELS,
  GOAL_LABELS,
  TRAINING_PLACE_OPTIONS,
  MUSCLE_LABELS,
  PROGRESSION_HELP,
  PROGRESSION_LABELS,
  formatLongDate,
  formatShortDate,
  pluralize,
} from '../lib/labels'
import { INTENSITY_SETS } from '../lib/intensity'
import { cn } from '@/lib/utils'
import type { DurationKey, GeneratedDay, ProgressionRule } from '../lib/types'

/** Three words at most: this sits in a hint beside four other things. */
const PLACE_SHORT: Record<string, string> = {
  bodyweight: 'at home',
  barbell: 'full gym',
  hibrido: 'gym and home',
}

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
  const addGeneratedPlan = useGym((s) => s.addGeneratedPlan)

  const [activeWeek, setActiveWeek] = useState(0)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [openDay, setOpenDay] = useState<GeneratedDay | null>(null)
  const [pendingDuration, setPendingDuration] = useState<DurationKey | null>(null)
  const [designing, setDesigning] = useState(false)
  const today = todayIso()

  const week = useMemo(() => plan?.weeks[activeWeek] ?? plan?.weeks[0], [plan, activeWeek])

  /**
   * Which block this week belongs to, when the programme has blocks that differ.
   *
   * Absent on everything designed before a block could say where it trains, and
   * absent on any programme the coach did not phase — in both cases the header
   * simply does not appear, rather than showing "Block 1 of 1" to say nothing.
   */
  const block = useMemo(() => {
    if (!plan?.blocks || plan.blocks.length < 2 || week?.blockIndex === undefined) return null
    const meta = plan.blocks[week.blockIndex]
    if (!meta || (!meta.label && !meta.place && !meta.intensity)) return null
    return { index: week.blockIndex, total: plan.blocks.length, ...meta }
  }, [plan, week])

  /* The same numbers the kitchen uses elsewhere, from the same input that
     paces the training: the gym and the plate never disagree. */
  const nutrition = useMemo(() => (plan ? nutritionTargetFor(plan.input) : null), [plan])

  const plates = useDayPlates(week ? week.days.map((d) => d.date) : [])

  if (!plan || !week) {
    return (
      <div className="flex flex-col gap-8">
        <PageHeader title="Plan not found" />
        <EmptyState
          title="This programme no longer exists"
          description="It was deleted, or the link points at a programme from a different browser."
          action={
            <Button variant="primary" onClick={() => navigate({ to: '/onboarding' })}>
              Design my programme
            </Button>
          }
        />
      </div>
    )
  }

  const save = () => {
    const planId = saveGeneratedAsPlan(plan.id)
    if (planId) {
      writePlannerSelection(planId)
      void navigate({ to: '/planner' })
    }
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

  const weightCheckpoints = plan.milestones.filter((m) => m.weight !== undefined)

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title={plan.weeklyTemplate.name}
        description={`${GOAL_LABELS[plan.input.goal]} over ${plan.weeks.length} weeks. Tap a day for movement detail. Programmes are read-only: copy one to the planner and edit the copy.`}
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
            <Button variant="primary" onClick={save}>
              Copy to planner
              <ArrowRight size={16} weight="bold" />
            </Button>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <AuroraTile
          tone="green"
          label="Programme"
          value={plan.weeks.length}
          unit="weeks"
          sub={`${plan.input.daysPerWeek} sessions a week, with a lighter deload every 4th week`}
        />
        <Panel padding="lg" className="flex flex-col justify-center gap-3">
          <FactRow label="Goal" value={GOAL_LABELS[plan.input.goal]} />
          <FactRow
            label="Schedule"
            value={`${plan.input.daysPerWeek} × ${plan.input.minsPerSession} min`}
          />
          <FactRow
            label="Training at"
            value={
              TRAINING_PLACE_OPTIONS.find((o) => o.value === plan.input.equipment)?.label ??
              EQUIPMENT_LABELS[plan.input.equipment]
            }
          />
          {plan.input.targetWeightKg !== undefined && (
            <FactRow
              label="Weight"
              value={`${plan.input.weightKg} to ${plan.input.targetWeightKg} kg`}
            />
          )}
          {plan.rateKgPerWeek > 0 && (
            <>
              <FactRow label="Safe rate" value={`${plan.rateKgPerWeek} kg / week`} />
              <FactRow
                label="Realistic timeline"
                value={`${plan.estimatedMonths} ${plan.estimatedMonths === 1 ? 'month' : 'months'}`}
              />
            </>
          )}
          {nutrition && (
            <>
              <FactRow label="Daily energy" value={`${nutrition.kcalTarget} kcal`} />
              <FactRow label="Daily protein" value={`${nutrition.proteinG} g`} />
            </>
          )}
          <FactRow
            label="Designed by"
            value={plan.source === 'coach' ? 'AI coach' : 'Standard template'}
          />
        </Panel>
      </div>

      {plan.coachNotes && (
        <Panel padding="md" className="flex gap-3">
          <Sparkle size={18} className="mt-0.5 shrink-0 text-ink-3" />
          <p className="max-w-[70ch] text-sm leading-relaxed text-ink-2">{plan.coachNotes}</p>
        </Panel>
      )}

      {plan.warnings.length > 0 && (
        <Panel padding="md" className="flex gap-3">
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
        /* The block, when there is more than one and they differ. It belongs on
           the week header rather than in a panel of its own: the question it
           answers — "why do these movements look nothing like last month's" —
           is asked while looking at the days. */
        hint={
          [
            block ? `Block ${block.index + 1} of ${block.total}` : null,
            block?.label,
            block?.place ? PLACE_SHORT[block.place] : null,
            block?.intensity ? `${INTENSITY_SETS[block.intensity]} sets` : null,
            isDeloadWeek(week.weekIndex) ? 'Deload week, lighter on purpose' : null,
          ]
            .filter(Boolean)
            .join(' · ') || undefined
        }
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
                  'num flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full px-3 text-xs font-medium transition-colors duration-150',
                  active
                    ? 'bg-brand text-brand-ink'
                    : isDeloadWeek(w.weekIndex)
                      ? 'border border-dashed border-line-strong bg-transparent text-ink-3 hover:text-ink'
                      : 'bg-surface text-ink-2 shadow-[var(--shadow-panel)] hover:text-ink',
                  hasToday && !active && 'ring-2 ring-brand/40',
                )}
              >
                {w.weekIndex + 1}
              </button>
            )
          })}
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {week.days.map((d) => (
            <DayCard
              key={d.date}
              day={d}
              isToday={d.date === today}
              plate={plates[d.date]}
              onOpen={() => setOpenDay(d)}
            />
          ))}
        </div>
      </Section>

      {weightCheckpoints.length > 0 && (
        <Section title="Checkpoints" hint={pluralize(weightCheckpoints.length, 'checkpoint')}>
          <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 md:-mx-8 md:px-8">
            {weightCheckpoints.map((m) => (
              <span
                key={m.week}
                className="num shrink-0 rounded-full bg-surface px-3 py-1.5 text-2xs text-ink-2 shadow-[var(--shadow-panel)]"
              >
                Week {m.week}, {m.weight} kg
              </span>
            ))}
          </div>
        </Section>
      )}

      <Section title="Try a different length">
        <div className="flex flex-wrap gap-2">
          {DURATION_KEYS.filter((d) => d !== plan.approvedDuration).map((d) => (
            <Button key={d} variant="secondary" onClick={() => setPendingDuration(d)}>
              {DURATION_LABELS[d]}
            </Button>
          ))}
        </div>
        <p className="text-2xs text-ink-3">
          enForma builds a fresh programme rather than editing this one.
        </p>
      </Section>

      <DayDetailDialog day={openDay} onClose={() => setOpenDay(null)} />

      <Dialog open={!!pendingDuration} onOpenChange={(open) => !open && setPendingDuration(null)}>
        <DialogContent className="sm:max-w-sm">
          {pendingDuration && (
            <>
              <DialogHeader>
                <DialogTitle>Build a {DURATION_LABELS[pendingDuration]} programme?</DialogTitle>
                <DialogDescription>
                  A new programme is generated from the same details, with its own calendar and
                  movement rotation. This one is kept, and anything you copied to the planner stays
                  as it is. The coach usually takes a minute or two.
                </DialogDescription>
              </DialogHeader>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" disabled={designing} onClick={() => setPendingDuration(null)}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  disabled={designing}
                  onClick={() => {
                    if (designing) return
                    setDesigning(true)
                    void buildProgramme(plan.input, pendingDuration)
                      .then((next) => {
                        addGeneratedPlan(next)
                        setPendingDuration(null)
                        setActiveWeek(0)
                        if (window.location.pathname.startsWith('/generated/')) {
                          void navigate({ to: '/generated/$id', params: { id: next.id } })
                        }
                      })
                      .finally(() => setDesigning(false))
                  }}
                >
                  {designing ? (
                    <>
                      <CircleNotch size={16} weight="bold" className="animate-spin" />
                      Designing
                    </>
                  ) : (
                    'Generate programme'
                  )}
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function FactRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-2xs font-medium text-ink-3">{label}</span>
      <span className="num text-right text-sm font-medium text-ink">{value}</span>
    </div>
  )
}

function DayCard({
  day,
  isToday,
  plate,
  onOpen,
}: {
  day: GeneratedDay
  isToday: boolean
  /** The plate suggested for this day, once the catalogue has answered. */
  plate: RecipeSuggestion | undefined
  onOpen: () => void
}) {
  const movements = day.exercises
    .map((pe) => ({ pe, ex: exerciseById(pe.exerciseId) }))
    .filter((m) => m.ex !== undefined)

  return (
    <div
      className={cn(
        'group flex flex-col gap-4 rounded-xl bg-surface p-5 text-left',
        'shadow-[var(--shadow-panel)] transition-shadow duration-150 hover:shadow-[var(--shadow-tile)]',
        isToday && 'ring-2 ring-brand',
      )}
    >
      <button type="button" onClick={onOpen} className="flex flex-col gap-4 text-left">
      <div className="flex w-full items-center justify-between gap-2">
        <span className="text-lg font-semibold text-ink">{DAY_FULL_LABELS[day.day]}</span>
        {isToday ? (
          <span className="rounded-full bg-brand px-2.5 py-1 text-2xs font-medium text-brand-ink">
            Today
          </span>
        ) : (
          <span className="num text-2xs text-ink-3">{formatShortDate(day.date)}</span>
        )}
      </div>

      <div className="flex items-center">
        <span className="flex -space-x-3">
          {movements.slice(0, 4).map(({ ex }) => (
            <ExerciseThumb
              key={ex!.id}
              exercise={ex!}
              size="md"
              className="rounded-full ring-2 ring-surface"
            />
          ))}
        </span>
        {movements.length > 4 && (
          <span className="num -ml-3 flex size-14 items-center justify-center rounded-full bg-surface-2 text-xs font-medium text-ink-2 ring-2 ring-surface">
            +{movements.length - 4}
          </span>
        )}
      </div>

      <ul className="flex w-full flex-col gap-1">
        {movements.slice(0, 3).map(({ ex }) => (
          <li key={ex!.id} className="truncate text-sm text-ink-2">
            {ex!.name}
          </li>
        ))}
        {movements.length > 3 && (
          <li className="text-2xs text-ink-3">and {movements.length - 3} more</li>
        )}
      </ul>

      </button>

      {plate && (
        <div className="border-t border-line pt-3">
          <DayPlate dish={plate} />
        </div>
      )}

      {day.ecNote && (
        <span className="flex w-full items-start gap-1.5 border-t border-line pt-3 text-2xs text-ink-3">
          <Plus size={12} weight="bold" className="mt-0.5 shrink-0 text-brand" />
          <span className="text-left">{day.ecNote}</span>
        </span>
      )}

      <button
        type="button"
        onClick={onOpen}
        className={cn(
          'flex w-full items-center justify-between text-2xs font-medium text-ink-3',
          !day.ecNote && 'border-t border-line pt-3',
        )}
      >
        {pluralize(movements.length, 'movement')}
        <span className="flex items-center gap-1 text-ink-2 transition-transform duration-150 group-hover:translate-x-0.5">
          View day
          <CaretRight size={12} weight="bold" />
        </span>
      </button>
    </div>
  )
}

function DayDetailDialog({ day, onClose }: { day: GeneratedDay | null; onClose: () => void }) {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const rules = useMemo(() => {
    const present = new Set<ProgressionRule>()
    for (const pe of day?.exercises ?? []) present.add(pe.progression)
    return [...present]
  }, [day])

  return (
    <Dialog
      open={!!day}
      onOpenChange={(open) => {
        if (!open) {
          onClose()
          setExpandedId(null)
        }
      }}
    >
      <DialogContent className="flex max-h-[85dvh] flex-col gap-4 sm:max-w-xl">
        {day && (
          <>
            <DialogHeader>
              <DialogTitle>{DAY_FULL_LABELS[day.day]}</DialogTitle>
              <DialogDescription>
                {formatLongDate(day.date)}, {pluralize(day.exercises.length, 'movement')}. Tap a
                movement for photos and instructions.
                {day.ecNote && ` If you have more: ${day.ecNote}`}
              </DialogDescription>
            </DialogHeader>

            <div className="-mx-1 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-1">
              {day.exercises.map((pe) => {
                const ex = exerciseById(pe.exerciseId)
                if (!ex) return null
                const open = expandedId === pe.exerciseId
                return (
                  <div key={pe.exerciseId} className="rounded-lg bg-surface-2">
                    <button
                      type="button"
                      onClick={() => setExpandedId(open ? null : pe.exerciseId)}
                      aria-expanded={open}
                      className="flex w-full items-center gap-3 p-3 text-left"
                    >
                      <ExerciseThumb exercise={ex} size="md" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-ink">
                          {ex.name}
                        </span>
                        <span className="block text-2xs text-ink-3">
                          {MUSCLE_LABELS[ex.muscle]} · {EQUIPMENT_LABELS[ex.equipment]}
                        </span>
                      </span>
                      {pe.progression !== 'none' && (
                        <Tag tone="brand">{PROGRESSION_LABELS[pe.progression]}</Tag>
                      )}
                      <CaretDown
                        size={14}
                        weight="bold"
                        className={cn(
                          'shrink-0 text-ink-3 transition-transform duration-150',
                          open && 'rotate-180',
                        )}
                      />
                    </button>

                    {open && (
                      <div className="flex flex-col gap-3 px-3 pb-3">
                        <MovementFrames exercise={ex} />
                        {ex.instructions && ex.instructions.length > 0 ? (
                          <ol className="flex flex-col gap-2">
                            {ex.instructions.map((step, i) => (
                              <li key={i} className="flex gap-2.5 text-sm leading-relaxed text-ink-2">
                                <span className="num flex size-5 shrink-0 items-center justify-center rounded-full bg-surface text-2xs font-semibold text-ink-3">
                                  {i + 1}
                                </span>
                                {step}
                              </li>
                            ))}
                          </ol>
                        ) : (
                          <p className="text-sm text-ink-3">
                            No instructions available for this movement.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {rules.length > 0 && (
              <div className="flex flex-col gap-1.5 border-t border-line pt-3">
                {rules.map((r) => (
                  <p key={r} className="text-2xs leading-relaxed text-ink-3">
                    <span className="font-semibold text-ink-2">{PROGRESSION_LABELS[r]}:</span>{' '}
                    {PROGRESSION_HELP[r]}
                  </p>
                ))}
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
