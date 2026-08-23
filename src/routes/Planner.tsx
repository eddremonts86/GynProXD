import { useMemo, useState } from 'react'
import { useGym, DAY_LABELS, DAYS } from '../store/useGym'
import { exerciseById, exerciseLookup } from '../lib/exercises'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { EmptyState } from '../ui/EmptyState'
import { Input } from '../ui/Input'
import { PageHeader } from '../ui/PageHeader'
import { Illustration } from '../ui/Illustration'
import type { DayOfWeek, ProgressionRule } from '../lib/types'

const DAY_ORDER = DAYS

export function PlannerPage() {
  const plans = useGym((s) => s.plans)
  const customExercises = useGym((s) => s.customExercises)
  const createPlan = useGym((s) => s.createPlan)
  const deletePlan = useGym((s) => s.deletePlan)
  const addExerciseToDay = useGym((s) => s.addExerciseToDay)
  const removeExerciseFromDay = useGym((s) => s.removeExerciseFromDay)
  const updateExerciseProgression = useGym((s) => s.updateExerciseProgression)
  const startWorkoutFromPlan = useGym((s) => s.startWorkoutFromPlan)

  const exercises = useMemo(
    () => Array.from(exerciseLookup(customExercises).values()).sort((a, b) => a.name.localeCompare(b.name)),
    [customExercises],
  )

  const [newPlanName, setNewPlanName] = useState('')
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(plans[0]?.id ?? null)
  const [filterByDay, setFilterByDay] = useState<Record<DayOfWeek, string>>({
    mon: '',
    tue: '',
    wed: '',
    thu: '',
    fri: '',
    sat: '',
    sun: '',
  })

  const selectedPlan = plans.find((p) => p.id === selectedPlanId) ?? plans[0] ?? null

  const handleCreate = () => {
    const id = createPlan(newPlanName || 'My Plan')
    setNewPlanName('')
    setSelectedPlanId(id)
  }

  if (plans.length === 0 || !selectedPlan) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          eyebrow="Forma · Planner"
          title="Weekly rhythm"
          description="Hybrid calisthenics + barbell, planned around your week. Each day is a quiet promise."
        />
        <Illustration variant="hero" className="h-36 w-full" />
        <EmptyState
          title="No plans yet"
          description="Create your first weekly plan. Add exercises per day, pick progression, and start guided sessions from Today."
          action={
            <div className="flex w-full max-w-sm gap-2">
              <Input
                value={newPlanName}
                onChange={(e) => setNewPlanName(e.target.value)}
                placeholder="Plan name — e.g. Push / Pull / Legs"
                className="flex-1"
              />
              <Button onClick={handleCreate}>Create</Button>
            </div>
          }
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Forma · Planner"
        title={selectedPlan.name}
        description="Warm data, offline. Tap a day to add movements — 3D plate is your rest between sets."
        action={
          <Button variant="secondary" size="sm" onClick={() => deletePlan(selectedPlan.id)} disabled={plans.length === 0}>
            Delete plan
          </Button>
        }
      />

      <Illustration variant="orb" className="h-20 w-full" />

      <Card className="flex flex-col gap-3">
        <div className="flex flex-col gap-2">
          <label className="text-xs font-medium tracking-widest text-muted uppercase">Plans</label>
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {plans.map((p) => (
              <button
                key={p.id}
                onClick={() => setSelectedPlanId(p.id)}
                className={[
                  'shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                  selectedPlanId === p.id || (!selectedPlanId && p.id === plans[0].id)
                    ? 'border-accent bg-accent text-accent-contrast'
                    : 'border-line bg-card text-muted hover:border-line-strong hover:text-ink-soft',
                ].join(' ')}
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (!newPlanName.trim()) return
            handleCreate()
          }}
          className="flex gap-2"
        >
          <Input
            value={newPlanName}
            onChange={(e) => setNewPlanName(e.target.value)}
            placeholder="New plan name…"
            className="flex-1"
          />
          <Button type="submit" disabled={!newPlanName.trim()}>
            Create
          </Button>
        </form>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {DAY_ORDER.map((day) => {
          const plannedDay = selectedPlan.days.find((d) => d.day === day)
          const dayExercises = plannedDay?.exercises ?? []
          const filter = filterByDay[day]
          const filtered = filter.trim()
            ? exercises
                .filter(
                  (e) =>
                    e.name.toLowerCase().includes(filter.toLowerCase()) ||
                    e.muscle.includes(filter.toLowerCase()),
                )
                .slice(0, 6)
            : []

          return (
            <Card key={day} className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-base text-ink">
                  {DAY_LABELS[day]} <span className="font-sans text-xs font-normal tracking-wide text-muted uppercase">· {dayExercises.length}</span>
                </h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => startWorkoutFromPlan(selectedPlan.id, day)}
                  disabled={dayExercises.length === 0}
                >
                  Start
                </Button>
              </div>

              {dayExercises.length > 0 ? (
                <ul className="flex flex-col gap-2">
                  {dayExercises.map((pe) => {
                    const ex = exerciseById(pe.exerciseId)
                    return (
                      <li
                        key={pe.exerciseId}
                        className="flex items-center justify-between gap-2 rounded-[var(--radius-md)] bg-surface-2 px-3 py-2 border border-line/40"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-ink-soft">{ex?.name ?? pe.exerciseId}</p>
                          {ex && (
                            <span className="text-xs text-muted">
                              {ex.muscle} · {ex.equipment}
                            </span>
                          )}
                        </div>
                        <select
                          value={pe.progression}
                          onChange={(e) =>
                            updateExerciseProgression(
                              selectedPlan.id,
                              day,
                              pe.exerciseId,
                              e.target.value as ProgressionRule,
                            )
                          }
                          className="rounded-full border border-line bg-surface px-2 py-1 text-xs text-ink-soft outline-none focus:border-accent"
                        >
                          <option value="none">none</option>
                          <option value="linear">linear</option>
                          <option value="double">double</option>
                        </select>
                        <button
                          onClick={() => removeExerciseFromDay(selectedPlan.id, day, pe.exerciseId)}
                          className="rounded-full p-1 text-muted hover:bg-surface hover:text-ink-soft"
                          aria-label="Remove"
                        >
                          ×
                        </button>
                      </li>
                    )
                  })}
                </ul>
              ) : (
                <p className="rounded-[var(--radius-md)] border border-dashed border-line/60 bg-transparent px-3 py-4 text-center text-xs text-muted">
                  No exercises — warm, human, offline
                </p>
              )}

              <div className="flex flex-col gap-2 border-t border-line pt-3">
                <Input
                  value={filter}
                  onChange={(e) => setFilterByDay((prev) => ({ ...prev, [day]: e.target.value }))}
                  placeholder="Add exercise — search…"
                />
                {filtered.length > 0 && (
                  <div className="flex flex-col gap-1">
                    {filtered.map((e) => (
                      <div
                        key={e.id}
                        className="flex items-center justify-between gap-2 rounded-[var(--radius-md)] border border-transparent bg-surface px-3 py-2 hover:border-line"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-xs font-medium text-ink-soft">{e.name}</p>
                          <div className="flex gap-1 mt-1">
                            <Badge>{e.muscle}</Badge>
                            <Badge variant="muted">{e.equipment}</Badge>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            addExerciseToDay(selectedPlan.id, day, e.id)
                            setFilterByDay((prev) => ({ ...prev, [day]: '' }))
                          }}
                        >
                          Add
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
