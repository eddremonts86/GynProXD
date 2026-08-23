import { useParams, useNavigate } from '@tanstack/react-router'
import { useGym } from '../store/useGym'
import { exerciseById } from '../lib/exercises'
import { Card } from '../ui/Card'
import { Button } from '../ui/Button'
import { Badge } from '../ui/Badge'
import { PageHeader } from '../ui/PageHeader'
import { Illustration } from '../ui/Illustration'

export function GeneratedPlanPage() {
  const params = useParams({ strict: false }) as { id?: string }
  const id = (params as { id?: string }).id ?? (params as { generatedId?: string }).generatedId ?? ''
  const plan = useGym((s) => s.generatedPlans.find((g) => g.id === id))
  const saveAsPlan = useGym((s) => s.saveGeneratedAsPlan)
  const deleteGen = useGym((s) => s.deleteGeneratedPlan)
  const navigate = useNavigate()

  if (!plan) {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader eyebrow="Forma · Plan" title="No encontrado" description="Este plan no existe o fue eliminado." />
        <Button variant="secondary" onClick={() => navigate({ to: '/onboarding' })}>
          Volver a onboarding
        </Button>
      </div>
    )
  }

  const handleSave = () => {
    const planId = saveAsPlan(plan.id)
    if (planId) navigate({ to: '/planner' })
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={`Forma · ${plan.approvedDuration} · ${plan.input.goal}`}
        title={plan.weeklyTemplate.name}
        description={`${plan.weeks.length} semanas · ${plan.input.daysPerWeek}× ${plan.input.minsPerSession}min · esfuerzo ${plan.input.effort} · ${plan.input.weightKg}kg → ${plan.input.targetWeightKg ?? '—'}kg`}
        action={
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => deleteGen(plan.id)}>
              Eliminar
            </Button>
            <Button size="sm" onClick={handleSave}>
              Guardar en Planner
            </Button>
          </div>
        }
      />

      <Illustration variant="hero" className="h-28 w-full" />

      <Card>
        <h3 className="font-display text-lg text-ink">Estimación</h3>
        <div className="mt-3 grid grid-cols-3 gap-3">
          <div className="rounded-[var(--radius-md)] bg-surface-2 border border-line/40 px-3 py-2 text-center">
            <p className="text-xs tracking-widest text-muted uppercase">Estimado</p>
            <p className="font-display text-xl text-ink">{plan.estimatedMonths}m</p>
            <p className="text-xs text-muted">{plan.estimatedWeeks} sem</p>
          </div>
          <div className="rounded-[var(--radius-md)] bg-surface-2 border border-line/40 px-3 py-2 text-center">
            <p className="text-xs tracking-widest text-muted uppercase">Ritmo</p>
            <p className="font-display text-xl text-accent">{plan.rateKgPerWeek}</p>
            <p className="text-xs text-muted">kg/sem</p>
          </div>
          <div className="rounded-[var(--radius-md)] bg-surface-2 border border-line/40 px-3 py-2 text-center">
            <p className="text-xs tracking-widest text-muted uppercase">Duración</p>
            <p className="font-display text-xl text-ink">{plan.approvedDuration}</p>
            <p className="text-xs text-muted">{plan.weeks.length} sem</p>
          </div>
        </div>
        {plan.warnings.length > 0 && (
          <div className="mt-3 rounded-[var(--radius-md)] border border-accent/20 bg-accent-soft px-3 py-2">
            {plan.warnings.map((w) => (
              <p key={w} className="text-xs leading-4 text-accent">
                ⚠ {w}
              </p>
            ))}
          </div>
        )}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {plan.milestones.slice(0, 8).map((m) => (
            <span key={m.week} className="rounded-full bg-surface-2 px-2.5 py-1 text-xs border border-line/40 text-ink-soft">
              s{m.week}: {m.weight ?? '·'}kg
            </span>
          ))}
        </div>
      </Card>

      <div className="flex flex-col gap-4">
        {plan.weeks.map((week) => (
          <Card key={week.weekIndex} padding="md">
            <div className="flex items-center justify-between">
              <h4 className="font-display text-base text-ink">
                Semana {week.weekIndex + 1}
                {(week.weekIndex + 1) % 4 === 0 && <span className="ml-2 text-xs font-sans tracking-wide text-accent uppercase">deload</span>}
              </h4>
              <Badge variant="muted">{week.days.length} días</Badge>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {week.days.map((d) => (
                <div key={d.date} className="rounded-[var(--radius-md)] bg-surface-2 border border-line/40 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold tracking-widest text-accent uppercase">{d.day}</span>
                    <span className="font-mono text-xs text-muted">{d.date}</span>
                  </div>
                  <ul className="mt-2 flex flex-col gap-1.5">
                    {d.exercises.map((pe) => {
                      const ex = exerciseById(pe.exerciseId)
                      return (
                        <li key={pe.exerciseId} className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm text-ink-soft">{ex?.name ?? pe.exerciseId}</span>
                          {pe.progression !== 'none' && <Badge variant="muted">{pe.progression}</Badge>}
                        </li>
                      )
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>

      <div className="flex gap-2">
        <Button variant="secondary" onClick={() => navigate({ to: '/planner' })}>
          Ver Planner
        </Button>
        <Button onClick={handleSave} className="flex-1">
          Guardar como Weekly Plan
        </Button>
      </div>
    </div>
  )
}
