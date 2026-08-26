import { useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { ArrowRight, CaretLeft, CaretRight, Check, PencilSimple, Plus, SlidersHorizontal, Trash, X } from '@phosphor-icons/react'
import { useGym, DAYS, DAY_LABELS } from '../store/useGym'
import { exerciseById } from '../lib/exercises'
import { Button, IconButton } from '../ui/Button'
import { Panel } from '../ui/Panel'
import { Tag } from '../ui/Tag'
import { Input } from '../ui/Input'
import { FormSelect } from '../ui/FormSelect'
import { ExerciseThumb } from '../ui/ExerciseThumb'
import { PageHeader, Section } from '../ui/PageHeader'
import { EmptyState } from '../ui/EmptyState'
import { ExercisePicker } from '@/components/exercise-picker'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import {
  DAY_FULL_LABELS,
  EQUIPMENT_LABELS,
  formatShortDate,
  GOAL_LABELS,
  MUSCLE_LABELS,
  PROGRESSION_LABELS,
  pluralize,
} from '../lib/labels'
import { readPlannerSelection, writePlannerSelection } from '../lib/planner-selection'
import { toLocalIso, todayIso } from '../lib/dates'
import { cn } from '@/lib/utils'
import type { DayOfWeek, PlannedExercise, ProgressionRule, WeeklyPlan } from '../lib/types'

const DAY_BY_INDEX: DayOfWeek[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

interface PlanSummary {
  id: string
  name: string
  movements: number
  activeDays: number
  topMuscles: string[]
  trainsToday: boolean
}

export function PlannerPage() {
  const navigate = useNavigate()
  const plans = useGym((s) => s.plans)
  const generatedPlans = useGym((s) => s.generatedPlans)
  const createPlan = useGym((s) => s.createPlan)
  const renamePlan = useGym((s) => s.renamePlan)
  const deletePlan = useGym((s) => s.deletePlan)
  const addExerciseToDay = useGym((s) => s.addExerciseToDay)
  const removeExerciseFromDay = useGym((s) => s.removeExerciseFromDay)
  const startWorkoutFromPlan = useGym((s) => s.startWorkoutFromPlan)

  const todayDow: DayOfWeek = DAY_BY_INDEX[new Date().getDay()] ?? 'mon'

  /* Session-scoped so revisiting the page keeps you on the plan you were
     working in, without polluting the persisted training data. */
  const [selectedPlanId, setSelectedPlanIdState] = useState<string | null>(readPlannerSelection)
  const setSelectedPlanId = (id: string | null) => {
    setSelectedPlanIdState(id)
    writePlannerSelection(id)
  }
  const [selectedDate, setSelectedDate] = useState<string>(todayIso)
  const selectedDay: DayOfWeek = useMemo(() => {
    const [y, m, d] = selectedDate.split('-').map(Number)
    return MONTH_DOW[(new Date(y, m - 1, d).getDay() + 6) % 7]
  }, [selectedDate])

  /* The seven dates of the week holding the selection, Monday first. */
  const weekDates = useMemo(() => {
    const [y, m, d] = selectedDate.split('-').map(Number)
    const base = new Date(y, m - 1, d)
    base.setDate(base.getDate() - ((base.getDay() + 6) % 7))
    return DAYS.map((_, i) => {
      const dt = new Date(base)
      dt.setDate(base.getDate() + i)
      return toLocalIso(dt)
    })
  }, [selectedDate])
  const [newPlanName, setNewPlanName] = useState('')
  const [creating, setCreating] = useState<'choose' | 'name' | null>(null)
  const [renameValue, setRenameValue] = useState<string | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [configuring, setConfiguring] = useState<PlannedExercise | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  /* Derived, so deleting a plan falls back to the first one with no effect needed. */
  const selectedPlan = plans.find((p) => p.id === selectedPlanId) ?? plans[0] ?? null

  /* What each plan amounts to, so switching is a decision rather than a guess. */
  const summaries = useMemo<PlanSummary[]>(
    () =>
      plans.map((p) => {
        const muscleCounts = new Map<string, number>()
        let movements = 0
        let activeDays = 0
        for (const d of p.days) {
          if (d.exercises.length > 0) activeDays += 1
          for (const pe of d.exercises) {
            movements += 1
            const muscle = exerciseById(pe.exerciseId)?.muscle
            if (muscle) muscleCounts.set(muscle, (muscleCounts.get(muscle) ?? 0) + 1)
          }
        }
        const topMuscles = [...muscleCounts.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([m]) => MUSCLE_LABELS[m as keyof typeof MUSCLE_LABELS])
        const trainsToday =
          (p.days.find((d) => d.day === todayDow)?.exercises.length ?? 0) > 0
        return { id: p.id, name: p.name, movements, activeDays, topMuscles, trainsToday }
      }),
    [plans, todayDow],
  )

  const handleCreate = () => {
    const name = newPlanName.trim()
    if (!name) return
    setSelectedPlanId(createPlan(name))
    setNewPlanName('')
    setCreating(null)
  }

  const dayExercises = useMemo(
    () => selectedPlan?.days.find((d) => d.day === selectedDay)?.exercises ?? [],
    [selectedPlan, selectedDay],
  )

  if (plans.length === 0 && generatedPlans.length === 0) {
    return (
      <div className="flex flex-col gap-8">
        <PageHeader
          title="Planner"
          description="Lay out the week once. Today reads from it every morning."
        />
        <EmptyState
          title="No plans yet"
          description="Generate a periodised plan from your goal and the time you actually have, or start an empty week and fill it in yourself."
          action={
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button onClick={() => navigate({ to: '/onboarding' })}>
                Design my programme
                <ArrowRight size={16} weight="bold" />
              </Button>
              <Button variant="secondary" onClick={() => setSelectedPlanId(createPlan('My week'))}>
                Start an empty week
              </Button>
            </div>
          }
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Planner"
        description="Lay out the week once. Today reads from it every morning."
        action={
          <Button onClick={() => setCreating('choose')}>
            <Plus size={16} weight="bold" />
            New plan
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[17rem_minmax(0,1fr)] lg:items-start">
        {/* The rail holds everything you can train from: editable plans first,
            designed programmes below them. A plan selects into the editor; a
            programme opens on its own page. */}
        <div className="flex min-w-0 flex-col gap-5">
          {summaries.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-2xs font-medium text-ink-3">Plans</span>
              <div
                role="tablist"
                aria-label="Your plans"
                className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0 lg:pb-0"
              >
                {summaries.map((s) => {
                  const active = s.id === selectedPlan?.id
                  return (
                    <button
                      key={s.id}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => {
                        setSelectedPlanId(s.id)
                        setConfirmDelete(false)
                      }}
                      className={cn(
                        'flex min-w-56 shrink-0 flex-col gap-2 rounded-xl bg-surface p-4 text-left lg:min-w-0',
                        'shadow-[var(--shadow-panel)] transition-shadow duration-150 hover:shadow-[var(--shadow-tile)]',
                        active && 'ring-2 ring-brand',
                      )}
                    >
                      <span className="flex w-full items-start justify-between gap-2">
                        <span className="truncate text-sm font-semibold text-ink">{s.name}</span>
                        {s.trainsToday && <Tag tone="brand">Today</Tag>}
                      </span>
                      <span className="num text-2xs text-ink-3">
                        {pluralize(s.movements, 'movement')}, {pluralize(s.activeDays, 'day')}
                      </span>
                      {s.topMuscles.length > 0 && (
                        <span className="flex flex-wrap gap-1">
                          {s.topMuscles.map((m) => (
                            <Tag key={m}>{m}</Tag>
                          ))}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {generatedPlans.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-2xs font-medium text-ink-3">Programmes</span>
              <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0 lg:pb-0">
                {generatedPlans.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => navigate({ to: '/generated/$id', params: { id: g.id } })}
                    className={cn(
                      'flex min-w-56 shrink-0 items-center gap-3 rounded-xl bg-surface p-3.5 text-left lg:min-w-0',
                      'shadow-[var(--shadow-panel)] transition-shadow duration-150 hover:shadow-[var(--shadow-tile)]',
                    )}
                  >
                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-semibold text-ink">
                          {g.weeklyTemplate.name}
                        </span>
                        <Tag tone={g.source === 'coach' ? 'brand' : 'neutral'}>
                          {g.source === 'coach' ? 'AI coach' : 'Standard'}
                        </Tag>
                      </span>
                      <span className="num text-2xs text-ink-3">
                        {GOAL_LABELS[g.input.goal]}, {g.weeks.length} weeks
                      </span>
                    </span>
                    <CaretRight size={14} weight="bold" className="shrink-0 text-ink-3" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Selected plan: week strip on top, the day being edited below. */}
        {selectedPlan ? (
          <div className="flex min-w-0 flex-col gap-5">
            <Section
              title={selectedPlan.name}
              hint={pluralize(
                selectedPlan.days.reduce((n, d) => n + d.exercises.length, 0),
                'movement',
              )}
              action={
                confirmDelete ? (
                  <>
                    <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => {
                        deletePlan(selectedPlan.id)
                        setSelectedPlanId(null)
                        setConfirmDelete(false)
                      }}
                    >
                      Delete plan
                    </Button>
                  </>
                ) : (
                  <>
                    <IconButton
                      size="sm"
                      onClick={() => setRenameValue(selectedPlan.name)}
                      aria-label={`Rename ${selectedPlan.name}`}
                    >
                      <PencilSimple size={15} />
                    </IconButton>
                    <IconButton
                      size="sm"
                      onClick={() => setConfirmDelete(true)}
                      aria-label={`Delete ${selectedPlan.name}`}
                    >
                      <Trash size={15} />
                    </IconButton>
                  </>
                )
              }
            >
              <div className="grid grid-cols-7 gap-1.5">
                {DAYS.map((d, i) => {
                  const iso = weekDates[i]
                  const count = selectedPlan.days.find((x) => x.day === d)?.exercises.length ?? 0
                  const active = iso === selectedDate
                  const isToday = iso === todayIso()
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setSelectedDate(iso)}
                      aria-pressed={active}
                      aria-label={`${DAY_FULL_LABELS[d]} ${iso}${isToday ? ', today' : ''}, ${pluralize(count, 'movement')}`}
                      className={cn(
                        'flex min-h-16 flex-col items-center justify-center gap-0.5 rounded-md border transition-colors duration-150',
                        active
                          ? 'border-brand bg-brand text-brand-ink'
                          : count > 0
                            ? 'border-line bg-surface text-ink hover:border-line-strong'
                            : 'border-dashed border-line bg-transparent text-ink-3 hover:border-line-strong',
                        isToday && !active && 'ring-2 ring-brand/40',
                      )}
                    >
                      <span className="text-2xs font-medium">
                        {DAY_LABELS[d]} <span className="num">{Number(iso.slice(8))}</span>
                      </span>
                      <span className="num text-lg leading-none font-semibold">{count}</span>
                    </button>
                  )
                })}
              </div>
            </Section>

            <Panel padding="none" className="overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-5">
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="flex items-center gap-2">
                    <h2 className="text-xl text-ink">{DAY_FULL_LABELS[selectedDay]}</h2>
                    <span className="num text-sm text-ink-3">{formatShortDate(selectedDate)}</span>
                    {selectedDate === todayIso() && <Tag tone="brand">Today</Tag>}
                  </span>
                  <p className="text-sm text-ink-3">{pluralize(dayExercises.length, 'movement')}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="secondary" onClick={() => setPickerOpen(true)}>
                    <Plus size={16} weight="bold" />
                    Add movement
                  </Button>
                  <Button
                    disabled={dayExercises.length === 0}
                    onClick={() => {
                      startWorkoutFromPlan(selectedPlan.id, selectedDay)
                      void navigate({ to: '/' })
                    }}
                  >
                    Start
                  </Button>
                </div>
              </div>

              {dayExercises.length === 0 ? (
                <p className="px-5 py-10 text-center text-sm text-ink-3">
                  Nothing planned for {DAY_FULL_LABELS[selectedDay]}. Leave it empty for recovery,
                  or add a movement.
                </p>
              ) : (
                <ul className="divide-y divide-line">
                  {dayExercises.map((pe) => {
                    const ex = exerciseById(pe.exerciseId)
                    return (
                      <li key={pe.exerciseId} className="flex items-center gap-3 p-4 md:px-5">
                        {ex && <ExerciseThumb exercise={ex} size="md" />}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-ink">
                            {ex?.name ?? pe.exerciseId}
                          </p>
                          <div className="mt-1 flex flex-wrap items-center gap-1.5">
                            {ex && (
                              <span className="text-2xs text-ink-3">
                                {MUSCLE_LABELS[ex.muscle]} · {EQUIPMENT_LABELS[ex.equipment]}
                              </span>
                            )}
                            {pe.progression !== 'none' && (
                              <Tag tone="brand">{PROGRESSION_LABELS[pe.progression]}</Tag>
                            )}
                            {pe.timed && <Tag>Timed</Tag>}
                            {pe.unilateral && <Tag>Per side</Tag>}
                            {pe.supersetGroup && <Tag>Superset {pe.supersetGroup}</Tag>}
                          </div>
                        </div>
                        <IconButton
                          size="sm"
                          onClick={() => setConfiguring(pe)}
                          aria-label={`Configure ${ex?.name ?? pe.exerciseId}`}
                        >
                          <SlidersHorizontal size={16} />
                        </IconButton>
                        <IconButton
                          size="sm"
                          onClick={() =>
                            removeExerciseFromDay(selectedPlan.id, selectedDay, pe.exerciseId)
                          }
                          aria-label={`Remove ${ex?.name ?? pe.exerciseId}`}
                        >
                          <X size={16} />
                        </IconButton>
                      </li>
                    )
                  })}
                </ul>
              )}
            </Panel>

            <MonthCalendar
              plan={selectedPlan}
              selectedDate={selectedDate}
              onSelectDate={setSelectedDate}
            />

            <ExercisePicker
              open={pickerOpen}
              onOpenChange={setPickerOpen}
              excludeIds={dayExercises.map((e) => e.exerciseId)}
              title={`Add to ${DAY_FULL_LABELS[selectedDay]}`}
              description="Search by name, muscle or equipment."
              onSelect={(exercise) => {
                addExerciseToDay(selectedPlan.id, selectedDay, exercise.id)
                setPickerOpen(false)
              }}
            />

            <ExerciseConfigDialog
              planId={selectedPlan.id}
              day={selectedDay}
              exercise={configuring}
              onClose={() => setConfiguring(null)}
            />

            <Dialog
              open={renameValue !== null}
              onOpenChange={(open) => !open && setRenameValue(null)}
            >
              <DialogContent className="sm:max-w-sm">
                <DialogHeader>
                  <DialogTitle>Rename plan</DialogTitle>
                </DialogHeader>
                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    const name = renameValue?.trim()
                    if (name) renamePlan(selectedPlan.id, name)
                    setRenameValue(null)
                  }}
                  className="flex flex-col gap-3"
                >
                  <Input
                    label="Name"
                    value={renameValue ?? ''}
                    onChange={(e) => setRenameValue(e.target.value)}
                    autoFocus
                  />
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" onClick={() => setRenameValue(null)}>
                      Cancel
                    </Button>
                    <Button type="submit" disabled={!renameValue?.trim()}>
                      Save
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        ) : (
          <EmptyState
            title="No editable plans yet"
            description="Open a programme on the left and copy it to the planner, or start an empty week and build it yourself."
            action={
              <Button variant="secondary" onClick={() => setSelectedPlanId(createPlan('My week'))}>
                Start an empty week
              </Button>
            }
          />
        )}
      </div>

      <Dialog open={creating !== null} onOpenChange={(open) => !open && setCreating(null)}>
        <DialogContent className="sm:max-w-md">
          {creating === 'choose' ? (
            <>
              <DialogHeader>
                <DialogTitle>New plan</DialogTitle>
                <DialogDescription>
                  A plan is one week that repeats. Start it two ways.
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setCreating(null)
                    void navigate({ to: '/onboarding' })
                  }}
                  className="flex flex-col gap-1 rounded-lg bg-surface-2 p-4 text-left transition-colors hover:bg-line/60"
                >
                  <span className="text-sm font-semibold text-ink">Design my programme</span>
                  <span className="text-2xs leading-relaxed text-ink-3">
                    Tell enForma your goal and the time you have. The coach designs a periodised
                    programme you can copy here as a plan.
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setCreating('name')}
                  className="flex flex-col gap-1 rounded-lg bg-surface-2 p-4 text-left transition-colors hover:bg-line/60"
                >
                  <span className="text-sm font-semibold text-ink">Start an empty week</span>
                  <span className="text-2xs leading-relaxed text-ink-3">
                    Name it and fill in each day yourself, movement by movement.
                  </span>
                </button>
              </div>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Start an empty week</DialogTitle>
              </DialogHeader>
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  handleCreate()
                }}
                className="flex flex-col gap-3"
              >
                <Input
                  label="Name"
                  value={newPlanName}
                  onChange={(e) => setNewPlanName(e.target.value)}
                  placeholder="Push pull legs"
                  autoFocus
                />
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" onClick={() => setCreating(null)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={!newPlanName.trim()}>
                    Create
                  </Button>
                </div>
              </form>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

const MONTH_DOW: DayOfWeek[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']

interface MonthCell {
  iso: string
  dayOfMonth: number
  dow: DayOfWeek
  inMonth: boolean
}

function buildMonthCells(anchor: Date): MonthCell[] {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1)
  const start = new Date(first)
  start.setDate(first.getDate() - ((first.getDay() + 6) % 7))
  const cells: MonthCell[] = []
  for (let i = 0; i < 42; i++) {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    cells.push({
      iso: toLocalIso(d),
      dayOfMonth: d.getDate(),
      dow: MONTH_DOW[(d.getDay() + 6) % 7],
      inMonth: d.getMonth() === anchor.getMonth(),
    })
  }
  /* Drop a trailing all-outside week so short months stay five rows. */
  while (cells.length > 35 && cells.slice(-7).every((c) => !c.inMonth)) cells.splice(-7)
  return cells
}

/**
 * The plan's week projected across a real month, with the movements' photos in
 * each day and a mark on days that already have a recorded session. Tapping a
 * day selects its weekday in the editor above.
 */
function MonthCalendar({
  plan,
  selectedDate,
  onSelectDate,
}: {
  plan: WeeklyPlan
  selectedDate: string
  onSelectDate: (iso: string) => void
}) {
  const workouts = useGym((s) => s.workouts)
  /* null means "follow the selection's month"; paging sets an explicit month
     until the next selection snaps it back. */
  const [browse, setBrowse] = useState<{ y: number; m: number } | null>(null)
  const today = todayIso()

  const anchor = useMemo(() => {
    if (browse) return new Date(browse.y, browse.m, 1)
    const [y, m] = selectedDate.split('-').map(Number)
    return new Date(y, m - 1, 1)
  }, [browse, selectedDate])

  const page = (delta: number) =>
    setBrowse({ y: anchor.getFullYear(), m: anchor.getMonth() + delta })

  const cells = useMemo(() => buildMonthCells(anchor), [anchor])
  const trainedDates = useMemo(() => new Set(workouts.map((w) => w.date)), [workouts])
  const byDow = useMemo(() => {
    const map = new Map<DayOfWeek, PlannedExercise[]>(
      plan.days.map((d) => [d.day, d.exercises]),
    )
    return (dow: DayOfWeek): PlannedExercise[] => map.get(dow) ?? []
  }, [plan])

  const monthLabel = anchor.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })

  return (
    <Section
      title={monthLabel}
      action={
        <>
          <IconButton size="sm" onClick={() => page(-1)} aria-label="Previous month">
            <CaretLeft size={16} weight="bold" />
          </IconButton>
          {selectedDate !== today && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setBrowse(null)
                onSelectDate(today)
              }}
            >
              Today
            </Button>
          )}
          <IconButton size="sm" onClick={() => page(1)} aria-label="Next month">
            <CaretRight size={16} weight="bold" />
          </IconButton>
        </>
      }
    >
      <Panel padding="sm" className="flex flex-col gap-1.5">
        <div className="grid grid-cols-7 gap-1">
          {MONTH_DOW.map((d) => (
            <span key={d} className="py-1 text-center text-2xs font-medium text-ink-3">
              {DAY_LABELS[d]}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((cell) => {
            const planned = byDow(cell.dow)
            const trained = trainedDates.has(cell.iso)
            const isToday = cell.iso === today
            const isSelected = cell.iso === selectedDate
            return (
              <button
                key={cell.iso}
                type="button"
                onClick={() => {
                  setBrowse(null)
                  onSelectDate(cell.iso)
                }}
                aria-pressed={isSelected}
                aria-label={`${cell.iso}, ${pluralize(planned.length, 'movement')} planned${trained ? ', session recorded' : ''}`}
                className={cn(
                  'flex min-h-16 flex-col gap-1 overflow-hidden rounded-sm p-1.5 text-left transition-colors duration-150 sm:min-h-20',
                  isSelected
                    ? 'bg-brand text-brand-ink'
                    : cell.inMonth
                      ? planned.length > 0
                        ? 'bg-surface-2/70 hover:bg-surface-2'
                        : 'hover:bg-surface-2/60'
                      : 'opacity-40 hover:opacity-70',
                  isToday && !isSelected && 'ring-2 ring-brand',
                )}
              >
                <span className="flex w-full items-center justify-between">
                  <span
                    className={cn(
                      'num text-2xs leading-none',
                      isSelected
                        ? 'font-semibold text-brand-ink'
                        : isToday
                          ? 'font-semibold text-ink'
                          : 'text-ink-3',
                    )}
                  >
                    {cell.dayOfMonth}
                  </span>
                  {trained && <Check size={11} weight="bold" className="text-good" />}
                </span>
                {planned.length > 0 && (
                  <span className="flex items-center">
                    <span className="flex -space-x-1.5">
                      {planned.slice(0, 3).map(({ exerciseId }, i) => {
                        const ex = exerciseById(exerciseId)
                        if (!ex) return null
                        return (
                          <ExerciseThumb
                            key={exerciseId}
                            exercise={ex}
                            size="sm"
                            className={cn(
                              'size-5 rounded-full ring-1 ring-surface sm:size-6',
                              i >= 1 && 'hidden sm:block',
                            )}
                          />
                        )
                      })}
                    </span>
                    {planned.length > 1 && (
                      <span className="num ml-1 text-2xs text-ink-3 sm:hidden">
                        +{planned.length - 1}
                      </span>
                    )}
                    {planned.length > 3 && (
                      <span className="num ml-1 hidden text-2xs text-ink-3 sm:inline">
                        +{planned.length - 3}
                      </span>
                    )}
                  </span>
                )}
              </button>
            )
          })}
        </div>
        <p className="px-1 pt-1 text-2xs text-ink-3">
          Your plan's week repeats across the month. A check marks a recorded session; tap a day
          to move the week above onto it.
        </p>
      </Panel>
    </Section>
  )
}

function ExerciseConfigDialog({
  planId,
  day,
  exercise,
  onClose,
}: {
  planId: string
  day: DayOfWeek
  exercise: PlannedExercise | null
  onClose: () => void
}) {
  const updateExerciseProgression = useGym((s) => s.updateExerciseProgression)
  const updateExerciseOptions = useGym((s) => s.updateExerciseOptions)
  const plans = useGym((s) => s.plans)

  /* Read back from the store so the dialog reflects edits as they are made. */
  const live =
    plans
      .find((p) => p.id === planId)
      ?.days.find((d) => d.day === day)
      ?.exercises.find((e) => e.exerciseId === exercise?.exerciseId) ?? exercise

  const name = exercise ? (exerciseById(exercise.exerciseId)?.name ?? exercise.exerciseId) : ''

  return (
    <Dialog open={!!exercise} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        {live && (
          <>
            <DialogHeader>
              <DialogTitle>{name}</DialogTitle>
              <DialogDescription>How this movement behaves during a session.</DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-4">
              <FormSelect
                label="Progression"
                value={live.progression}
                onValueChange={(v) =>
                  updateExerciseProgression(planId, day, live.exerciseId, v as ProgressionRule)
                }
                options={(['none', 'linear', 'double'] as ProgressionRule[]).map((r) => ({
                  value: r,
                  label: PROGRESSION_LABELS[r],
                }))}
              />

              <ToggleRow
                label="Timed sets"
                hint="Log seconds instead of reps. For planks and holds."
                checked={!!live.timed}
                onChange={(checked) =>
                  updateExerciseOptions(planId, day, live.exerciseId, { timed: checked })
                }
              />

              <ToggleRow
                label="One side at a time"
                hint="Log a left and a right set separately."
                checked={!!live.unilateral}
                onChange={(checked) =>
                  updateExerciseOptions(planId, day, live.exerciseId, { unilateral: checked })
                }
              />

              <FormSelect
                label="Superset group"
                value={live.supersetGroup ?? ''}
                onValueChange={(v) =>
                  updateExerciseOptions(planId, day, live.exerciseId, { supersetGroup: v || null })
                }
                options={[
                  { value: '', label: 'Not in a superset' },
                  { value: 'A', label: 'Group A' },
                  { value: 'B', label: 'Group B' },
                  { value: 'C', label: 'Group C' },
                ]}
              />
              <p className="text-2xs text-ink-3">
                Movements in the same group run back to back. Rest only starts once the group is
                done.
              </p>

              <div className="flex justify-end">
                <Button onClick={onClose}>Done</Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string
  hint: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4">
      <span className="flex flex-col gap-0.5">
        <span className="text-sm font-medium text-ink">{label}</span>
        <span className="text-2xs text-ink-3">{hint}</span>
      </span>
      <Switch
        checked={checked}
        onCheckedChange={(v) => onChange(v === true)}
        aria-label={label}
        className="mt-0.5 shrink-0"
      />
    </label>
  )
}

