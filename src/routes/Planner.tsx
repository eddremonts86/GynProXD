import { useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { ArrowRight, Plus, SlidersHorizontal, Trash, X } from '@phosphor-icons/react'
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
  GOAL_LABELS,
  MUSCLE_LABELS,
  PROGRESSION_LABELS,
  pluralize,
} from '../lib/labels'
import { cn } from '@/lib/utils'
import type { DayOfWeek, PlannedExercise, ProgressionRule } from '../lib/types'

const DAY_BY_INDEX: DayOfWeek[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

export function PlannerPage() {
  const navigate = useNavigate()
  const plans = useGym((s) => s.plans)
  const createPlan = useGym((s) => s.createPlan)
  const deletePlan = useGym((s) => s.deletePlan)
  const addExerciseToDay = useGym((s) => s.addExerciseToDay)
  const removeExerciseFromDay = useGym((s) => s.removeExerciseFromDay)
  const startWorkoutFromPlan = useGym((s) => s.startWorkoutFromPlan)

  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null)
  const [selectedDay, setSelectedDay] = useState<DayOfWeek>(
    () => DAY_BY_INDEX[new Date().getDay()] ?? 'mon',
  )
  const [newPlanName, setNewPlanName] = useState('')
  const [creating, setCreating] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [configuring, setConfiguring] = useState<PlannedExercise | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  /* Derived, so deleting a plan falls back to the first one with no effect needed. */
  const selectedPlan = plans.find((p) => p.id === selectedPlanId) ?? plans[0] ?? null

  const handleCreate = () => {
    const name = newPlanName.trim()
    if (!name) return
    setSelectedPlanId(createPlan(name))
    setNewPlanName('')
    setCreating(false)
  }

  const dayExercises = useMemo(
    () => selectedPlan?.days.find((d) => d.day === selectedDay)?.exercises ?? [],
    [selectedPlan, selectedDay],
  )

  if (!selectedPlan) {
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
                Build my plan
                <ArrowRight size={16} weight="bold" />
              </Button>
              <Button variant="secondary" onClick={() => setSelectedPlanId(createPlan('My week'))}>
                Start an empty week
              </Button>
            </div>
          }
        />
        <GeneratedPlans onOpenPlan={(id) => setSelectedPlanId(id)} />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Planner"
        description="Lay out the week once. Today reads from it every morning."
        action={
          <>
            <Button variant="secondary" onClick={() => navigate({ to: '/onboarding' })}>
              Generate a plan
            </Button>
            <Button onClick={() => setCreating(true)}>
              <Plus size={16} weight="bold" />
              New plan
            </Button>
          </>
        }
      />

      {plans.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {plans.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setSelectedPlanId(p.id)}
              aria-pressed={p.id === selectedPlan.id}
              className={cn(
                'min-h-11 rounded-full border px-4 text-xs font-medium transition-colors duration-150',
                p.id === selectedPlan.id
                  ? 'border-brand bg-brand text-brand-ink'
                  : 'border-line bg-surface text-ink-3 hover:border-line-strong hover:text-ink',
              )}
            >
              {p.name}
            </button>
          ))}
        </div>
      )}

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
            <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(true)}>
              <Trash size={15} />
              Delete
            </Button>
          )
        }
      >
        {/* Week strip: the whole plan at a glance, one tap per day. */}
        <div className="grid grid-cols-7 gap-1.5">
          {DAYS.map((d) => {
            const count = selectedPlan.days.find((x) => x.day === d)?.exercises.length ?? 0
            const active = d === selectedDay
            return (
              <button
                key={d}
                type="button"
                onClick={() => setSelectedDay(d)}
                aria-pressed={active}
                aria-label={`${DAY_FULL_LABELS[d]}, ${pluralize(count, 'movement')}`}
                className={cn(
                  'flex min-h-16 flex-col items-center justify-center gap-1 rounded-md border transition-colors duration-150',
                  active
                    ? 'border-brand bg-brand text-brand-ink'
                    : count > 0
                      ? 'border-line bg-surface text-ink hover:border-line-strong'
                      : 'border-dashed border-line bg-transparent text-ink-3 hover:border-line-strong',
                )}
              >
                <span className="text-2xs font-medium">{DAY_LABELS[d]}</span>
                <span className="num text-lg leading-none font-semibold">{count}</span>
              </button>
            )
          })}
        </div>
      </Section>

      <Panel padding="none" className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-5">
          <div className="flex min-w-0 flex-col gap-1">
            <h2 className="text-xl text-ink">{DAY_FULL_LABELS[selectedDay]}</h2>
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
            Nothing planned for {DAY_FULL_LABELS[selectedDay]}. Leave it empty for recovery, or add
            a movement.
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
                    onClick={() => removeExerciseFromDay(selectedPlan.id, selectedDay, pe.exerciseId)}
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

      <GeneratedPlans onOpenPlan={(id) => setSelectedPlanId(id)} />

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

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>New plan</DialogTitle>
            <DialogDescription>
              A plan is one week that repeats. You can keep more than one.
            </DialogDescription>
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
              <Button variant="ghost" onClick={() => setCreating(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!newPlanName.trim()}>
                Create
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
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

function GeneratedPlans({ onOpenPlan }: { onOpenPlan: (planId: string) => void }) {
  const navigate = useNavigate()
  const generatedPlans = useGym((s) => s.generatedPlans)
  const saveGeneratedAsPlan = useGym((s) => s.saveGeneratedAsPlan)
  const deleteGeneratedPlan = useGym((s) => s.deleteGeneratedPlan)

  if (generatedPlans.length === 0) return null

  return (
    <Section title="Generated programmes" hint={pluralize(generatedPlans.length, 'programme')}>
      <ul className="flex flex-col gap-2">
        {generatedPlans.map((g) => (
          <li
            key={g.id}
            className="flex flex-wrap items-center gap-3 rounded-md border border-line bg-surface px-4 py-3"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-ink">{g.weeklyTemplate.name}</p>
              <p className="num mt-0.5 text-2xs text-ink-3">
                {GOAL_LABELS[g.input.goal]}, {g.weeks.length} weeks, {g.input.daysPerWeek} sessions
                a week
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => navigate({ to: '/generated/$id', params: { id: g.id } })}
              >
                View
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  const planId = saveGeneratedAsPlan(g.id)
                  if (planId) onOpenPlan(planId)
                }}
              >
                Copy to planner
              </Button>
              <IconButton
                size="sm"
                onClick={() => deleteGeneratedPlan(g.id)}
                aria-label={`Delete ${g.weeklyTemplate.name}`}
              >
                <Trash size={15} />
              </IconButton>
            </div>
          </li>
        ))}
      </ul>
    </Section>
  )
}
