import { useMemo, useState } from 'react'
import { useParams, useNavigate } from '@tanstack/react-router'
import { useGym } from '../store/useGym'
import { exerciseById } from '../lib/exercises'
import { Card } from '../ui/Card'
import { Button } from '../ui/Button'
import { Badge } from '../ui/Badge'
import { PageHeader } from '../ui/PageHeader'
import { Illustration } from '../ui/Illustration'
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'
import type { DurationKey } from '../lib/types'

export function GeneratedPlanPage() {
  const params = useParams({ strict: false }) as { id?: string }
  const id = (params as { id?: string }).id ?? (params as { generatedId?: string }).generatedId ?? ''
  const plan = useGym((s) => s.generatedPlans.find((g) => g.id === id))
  const saveAsPlan = useGym((s) => s.saveGeneratedAsPlan)
  const deleteGen = useGym((s) => s.deleteGeneratedPlan)
  const createGeneratedPlan = useGym((s) => s.createGeneratedPlan)
  const navigate = useNavigate()
  const [activeWeek, setActiveWeek] = useState(0)
  const todayStr = new Date().toISOString().slice(0, 10)

  const activeWeekData = useMemo(() => plan?.weeks[activeWeek] ?? plan?.weeks[0], [plan, activeWeek])

  if (!plan || !activeWeekData) {
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
  const handleExport = () => {
    const blob = new Blob([JSON.stringify(plan, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `forma-generated-${plan.id}.json`
    a.click()
    URL.revokeObjectURL(url)
  }
  const handleRegenerate = (d: DurationKey) => {
    const newId = createGeneratedPlan(plan.input, d)
    setActiveWeek(0)
    navigate({ to: '/generated/$id', params: { id: newId } })
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={`Forma · ${plan.approvedDuration} · ${plan.input.goal}`}
        title={plan.weeklyTemplate.name}
        description={`${plan.weeks.length} semanas · ${plan.input.daysPerWeek}× ${plan.input.minsPerSession}min · esfuerzo ${plan.input.effort} · ${plan.input.weightKg}kg → ${plan.input.targetWeightKg ?? '—'}kg`}
        action={
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={handleExport}>
              Exportar
            </Button>
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
        <div className="mt-4 border-t border-line pt-3">
          <p className="text-xs font-medium tracking-widest text-muted uppercase">Regenerar con otra duración</p>
          <p className="mt-0.5 text-xs text-muted">Mismos datos, nuevo calendario. El plan actual se conserva.</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {(['mensual', 'trimestral', 'semestral', 'anual'] as DurationKey[]).map((d) => (
              <Button
                key={d}
                size="sm"
                variant={d === plan.approvedDuration ? 'secondary' : 'ghost'}
                onClick={() => handleRegenerate(d)}
                className={d === plan.approvedDuration ? 'border-accent/40' : ''}
              >
                {d}{d === plan.approvedDuration ? ' ✓' : ''}
              </Button>
            ))}
          </div>
        </div>
      </Card>

      <Card>
        <div className="flex items-center justify-between gap-2">
          <h4 className="font-display text-base text-ink">Semanas</h4>
          <Badge variant="muted">{plan.weeks.length} total</Badge>
        </div>
        <ScrollArea className="mt-3">
          <div className="flex gap-1.5 pb-1">
            {plan.weeks.map((w) => (
              <button
                key={w.weekIndex}
                onClick={() => setActiveWeek(w.weekIndex)}
                className={[
                  'shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium min-h-9',
                  activeWeek === w.weekIndex ? 'border-accent bg-accent text-accent-contrast' : 'border-line bg-card text-muted',
                  w.days.some((d) => d.date === todayStr) ? 'ring-1 ring-accent' : '',
                ].join(' ')}
              >
                {w.weekIndex + 1}
                {(w.weekIndex + 1) % 4 === 0 ? ' • deload' : ''}
              </button>
            ))}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
        <div className="mt-2 flex gap-2">
          <Button variant="secondary" size="sm" disabled={activeWeek === 0} onClick={() => setActiveWeek((v) => Math.max(0, v - 1))}>
            ← Anterior
          </Button>
          <Button variant="secondary" size="sm" disabled={activeWeek === plan.weeks.length - 1} onClick={() => setActiveWeek((v) => Math.min(plan.weeks.length - 1, v + 1))}>
            Siguiente →
          </Button>
          <span className="ml-auto self-center text-xs text-muted">Semana {activeWeek + 1} de {plan.weeks.length}</span>
        </div>
      </Card>

      <Card key={activeWeekData.weekIndex} padding="md">
        <div className="flex items-center justify-between">
          <h4 className="font-display text-base text-ink">
            Semana {activeWeekData.weekIndex + 1}
            {(activeWeekData.weekIndex + 1) % 4 === 0 && <span className="ml-2 text-xs font-sans tracking-wide text-accent uppercase">deload</span>}
          </h4>
          <Badge variant="muted">{activeWeekData.days.length} días</Badge>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {activeWeekData.days.map((d) => {
            const isToday = d.date === todayStr
            return (
              <div key={d.date} className={['rounded-[var(--radius-md)] p-3 border', isToday ? 'bg-accent/10 border-accent/40 ring-1 ring-accent' : 'bg-surface-2 border-line/40'].join(' ')}>
                <div className="flex items-center justify-between">
                  <span className={['text-xs font-semibold tracking-widest uppercase', isToday ? 'text-accent' : 'text-accent'].join(' ')}>{d.day}{isToday ? ' • hoy' : ''}</span>
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
            )
          })}
        </div>
      </Card>

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
