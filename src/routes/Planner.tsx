import { useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useGym, DAY_LABELS, DAYS } from '../store/useGym'
import { exerciseById, exerciseLookup } from '../lib/exercises'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { EmptyState } from '../ui/EmptyState'
import { Input } from '../ui/Input'
import { PageHeader } from '../ui/PageHeader'
import { Illustration } from '../ui/Illustration'
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'
import type { DayOfWeek, ProgressionRule } from '../lib/types'

const DAY_ORDER = DAYS

export function PlannerPage() {
  const navigate = useNavigate()
  const plans = useGym((s) => s.plans)
  const generatedPlans = useGym((s) => s.generatedPlans)
  const customExercises = useGym((s) => s.customExercises)
  const createPlan = useGym((s) => s.createPlan)
  const deletePlan = useGym((s) => s.deletePlan)
  const addExerciseToDay = useGym((s) => s.addExerciseToDay)
  const removeExerciseFromDay = useGym((s) => s.removeExerciseFromDay)
  const updateExerciseProgression = useGym((s) => s.updateExerciseProgression)
  const updateExerciseOptions = useGym((s) => s.updateExerciseOptions)
  const startWorkoutFromPlan = useGym((s) => s.startWorkoutFromPlan)
  const deleteGeneratedPlan = useGym((s) => s.deleteGeneratedPlan)
  const saveGeneratedAsPlan = useGym((s) => s.saveGeneratedAsPlan)

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
        <Card className="border-accent/20 bg-accent-soft">
          <h3 className="font-display text-base text-ink">¿Nuevo aquí?</h3>
          <p className="mt-1 text-sm text-muted">Genera un plan mensual/trimestral/semestral/anual en 30s desde onboarding.</p>
          <Button className="mt-3 w-full" onClick={() => navigate({ to: '/onboarding' })}>
            Generar mi plan automático
          </Button>
        </Card>
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
        {generatedPlans.length > 0 && (
          <Card>
            <h3 className="font-display text-base text-ink">Planes generados</h3>
            <div className="mt-3 flex flex-col gap-2">
              {generatedPlans.slice(0, 5).map((g) => (
                <div key={g.id} className="flex items-center justify-between rounded-[var(--radius-md)] bg-surface-2 border border-line/40 px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink-soft">{g.weeklyTemplate.name}</p>
                    <p className="text-xs text-muted">
                      {g.approvedDuration} · {g.weeks.length} sem · {g.input.goal} · {g.input.daysPerWeek}×
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => navigate({ to: '/generated/$id', params: { id: g.id } })}>
                      Ver
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        const pid = saveGeneratedAsPlan(g.id)
                        if (pid) setSelectedPlanId(pid)
                      }}
                    >
                      Guardar
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}
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

      <Card className="border-accent/20 bg-accent-soft">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="font-display text-base text-ink">¿Sin plan?</h3>
            <p className="text-sm text-muted">Genera mensual/trimestral/semestral/anual en 30s.</p>
          </div>
          <Button size="sm" onClick={() => navigate({ to: '/onboarding' })}>
            Generar
          </Button>
        </div>
      </Card>

      {generatedPlans.length > 0 && (
        <Card>
          <h3 className="font-display text-base text-ink">Planes generados</h3>
          <p className="mt-1 text-xs tracking-wide text-muted uppercase">Local — toca Ver o Guardar en Planner</p>
          <div className="mt-3 flex flex-col gap-2">
            {generatedPlans.slice(0, 6).map((g) => (
              <div key={g.id} className="flex items-center justify-between rounded-[var(--radius-md)] bg-surface-2 border border-line/40 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink-soft">{g.weeklyTemplate.name}</p>
                  <p className="text-xs text-muted">
                    {g.approvedDuration} · {g.weeks.length} sem · {g.input.goal} · {g.input.daysPerWeek}×{g.input.minsPerSession}min · eff {g.input.effort}
                  </p>
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => navigate({ to: '/generated/$id', params: { id: g.id } })}>
                    Ver
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      const pid = saveGeneratedAsPlan(g.id)
                      if (pid) setSelectedPlanId(pid)
                    }}
                  >
                    Guardar
                  </Button>
                  <button
                    onClick={() => deleteGeneratedPlan(g.id)}
                    className="rounded-full p-1 text-muted hover:text-ink-soft"
                    aria-label="Eliminar"
                  >
                    ×
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card className="flex flex-col gap-3">
        <div className="flex flex-col gap-2">
          <label className="text-xs font-medium tracking-widest text-muted uppercase">Plans</label>
          <ScrollArea>
            <div className="flex gap-1.5 pb-1">
              {plans.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setSelectedPlanId(p.id)}
                  className={[
                    'shrink-0 rounded-full border px-4 py-2.5 text-xs font-medium transition-colors min-h-11',
                    selectedPlanId === p.id || (!selectedPlanId && p.id === plans[0].id)
                      ? 'border-accent bg-accent text-accent-contrast'
                      : 'border-line bg-card text-muted hover:border-line-strong hover:text-ink-soft',
                  ].join(' ')}
                >
                  {p.name}
                </button>
              ))}
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
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

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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
                  onClick={() => {
                    startWorkoutFromPlan(selectedPlan.id, day)
                    navigate({ to: '/' })
                  }}
                  disabled={dayExercises.length === 0}
                >
                  Start
                </Button>
              </div>

              {dayExercises.length > 0 ? (
                <ul className="flex flex-col gap-2">
                  {dayExercises.map((pe) => {
                    const ex = exerciseById(pe.exerciseId)
                    const isSuperset = !!pe.supersetGroup
                    return (
                      <li
                        key={pe.exerciseId}
                        className={[
                          'flex flex-col gap-1.5 rounded-[var(--radius-md)] px-3 py-2 border',
                          isSuperset ? 'bg-accent/5 border-accent/30' : 'bg-surface-2 border-line/40',
                        ].join(' ')}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-ink-soft flex items-center gap-1.5">
                              {isSuperset && <Badge variant="accent" className="px-1.5 py-0 text-[10px]">{pe.supersetGroup}</Badge>}
                              {ex?.name ?? pe.exerciseId}
                            </p>
                            {ex && (
                              <span className="text-xs text-muted">
                                {ex.muscle} · {ex.equipment}
                              </span>
                            )}
                          </div>
                          <button
                            onClick={() => removeExerciseFromDay(selectedPlan.id, day, pe.exerciseId)}
                            className="flex h-11 w-11 items-center justify-center rounded-full text-muted hover:bg-surface hover:text-ink-soft shrink-0"
                            aria-label={`Remove ${exerciseById(pe.exerciseId)?.name ?? pe.exerciseId}`}
                          >
                            ×
                          </button>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <label htmlFor={`prog-${day}-${pe.exerciseId}`} className="sr-only">
                            Progression for {exerciseById(pe.exerciseId)?.name ?? pe.exerciseId}
                          </label>
                          <select
                            id={`prog-${day}-${pe.exerciseId}`}
                            value={pe.progression}
                            onChange={(e) =>
                              updateExerciseProgression(
                                selectedPlan.id,
                                day,
                                pe.exerciseId,
                                e.target.value as ProgressionRule,
                              )
                            }
                            className="rounded-full border border-line bg-surface px-2 py-1 text-xs text-ink-soft outline-none focus:border-accent min-h-8"
                          >
                            <option value="none">none</option>
                            <option value="linear">linear</option>
                            <option value="double">double</option>
                          </select>
                          <button
                            onClick={() => updateExerciseOptions(selectedPlan.id, day, pe.exerciseId, { timed: !pe.timed })}
                            className={[
                              'rounded-full border px-2 py-1 text-xs min-h-8',
                              pe.timed ? 'border-accent bg-accent text-accent-contrast' : 'border-line bg-surface text-muted',
                            ].join(' ')}
                            title="Timed set (duration vs reps)"
                          >
                            ⏱ {pe.timed ? 'timed' : 'reps'}
                          </button>
                          <button
                            onClick={() => updateExerciseOptions(selectedPlan.id, day, pe.exerciseId, { unilateral: !pe.unilateral })}
                            className={[
                              'rounded-full border px-2 py-1 text-xs min-h-8',
                              pe.unilateral ? 'border-accent bg-accent text-accent-contrast' : 'border-line bg-surface text-muted',
                            ].join(' ')}
                            title="Unilateral (L/R per set)"
                          >
                            ⇄ {pe.unilateral ? 'L/R' : 'bilateral'}
                          </button>
                          <select
                            value={pe.supersetGroup ?? ''}
                            onChange={(e) => updateExerciseOptions(selectedPlan.id, day, pe.exerciseId, { supersetGroup: e.target.value || null })}
                            className="rounded-full border border-line bg-surface px-2 py-1 text-xs text-ink-soft outline-none focus:border-accent min-h-8"
                            title="Superset group"
                          >
                            <option value="">— superset</option>
                            <option value="A">A</option>
                            <option value="B">B</option>
                            <option value="C">C</option>
                          </select>
                        </div>
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
