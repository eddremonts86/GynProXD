import { useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { PageHeader } from '../ui/PageHeader'
import { Card } from '../ui/Card'
import { Input } from '../ui/Input'
import { FormSelect } from '../ui/FormSelect'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '../ui/Button'
import { Badge } from '../ui/Badge'
import { Illustration } from '../ui/Illustration'
import { estimatePlan } from '../lib/plan-estimate'
import { mergeWithDefaults, parseOnboarding } from '../lib/onboarding-parse'
import { useGym } from '../store/useGym'
import type { DurationKey, Goal, Level } from '../lib/types'

export function OnboardingPage() {
  const navigate = useNavigate()
  const createGeneratedPlan = useGym((s) => s.createGeneratedPlan)
  const [text, setText] = useState(
    'soy hombre 40 años, peso 140kg quiero adelgazar a 80kg, puedo ir 3 veces por semana 2h, gym, esfuerzo medio',
  )
  const [age, setAge] = useState('40')
  const [sex, setSex] = useState<'hombre' | 'mujer' | 'otro'>('hombre')
  const [weight, setWeight] = useState('140')
  const [target, setTarget] = useState('80')
  const [height, setHeight] = useState('178')
  const [goal, setGoal] = useState<Goal>('adelgazar')
  const [level, setLevel] = useState<Level>('principiante')
  const [days, setDays] = useState('3')
  const [mins, setMins] = useState('120')
  const [equipment, setEquipment] = useState('hibrido')
  const [effort, setEffort] = useState('3')
  const [duration, setDuration] = useState<DurationKey>('trimestral')

  const parsed = useMemo(() => parseOnboarding(text), [text])

  const input = useMemo(() => {
    const merged = mergeWithDefaults({
      age: parsed.partial.age ?? (Number(age) || 30),
      sex: (parsed.partial.sex as never) ?? sex,
      weightKg: parsed.partial.weightKg ?? (Number(weight) || 75),
      targetWeightKg: parsed.partial.targetWeightKg ?? (Number(target) || undefined),
      heightCm: parsed.partial.heightCm ?? (Number(height) || 175),
      goal: (parsed.partial.goal as Goal) ?? goal,
      level: (parsed.partial.level as Level) ?? level,
      daysPerWeek: parsed.partial.daysPerWeek ?? (Number(days) || 3),
      minsPerSession: parsed.partial.minsPerSession ?? (Number(mins) || 60),
      equipment: (parsed.partial.equipment as never) ?? (equipment as never),
      effort: (parsed.partial.effort as never) ?? ((Number(effort) as never) || 3),
    })
    return merged
  }, [parsed, age, sex, weight, target, height, goal, level, days, mins, equipment, effort])

  const estimate = useMemo(() => estimatePlan(input, duration), [input, duration])

  const applyParsed = () => {
    if (parsed.partial.age) setAge(String(parsed.partial.age))
    if (parsed.partial.sex) setSex(parsed.partial.sex as never)
    if (parsed.partial.weightKg) setWeight(String(parsed.partial.weightKg))
    if (parsed.partial.targetWeightKg) setTarget(String(parsed.partial.targetWeightKg))
    if (parsed.partial.heightCm) setHeight(String(parsed.partial.heightCm))
    if (parsed.partial.goal) setGoal(parsed.partial.goal as Goal)
    if (parsed.partial.level) setLevel(parsed.partial.level as Level)
    if (parsed.partial.daysPerWeek) setDays(String(parsed.partial.daysPerWeek))
    if (parsed.partial.minsPerSession) setMins(String(parsed.partial.minsPerSession))
    if (parsed.partial.equipment) setEquipment(String(parsed.partial.equipment))
    if (parsed.partial.effort) setEffort(String(parsed.partial.effort))
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Forma · Onboarding"
        title="Tu plan, en 30s"
        description="Di 4–6 cosas y te digo meses reales + periodización. Local-first, sin nube. Híbrido calistenia + gym, esforço horas + intensidad."
      />

      <Illustration variant="hero" className="h-28 w-full" />

      <Card>
        <h2 className="font-display text-lg text-ink">Cuéntame</h2>
        <p className="mt-1 text-sm text-muted">Ejemplo: “hombre 40a, 140→80kg, 3×/sem 2h, gym, esfuerzo medio, quiero adelgazar”</p>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          placeholder="Escribe aquí…"
          aria-label="Describe tu caso"
          className="mt-3 min-h-24 w-full bg-surface px-4 py-3 text-sm"
        />
        <div className="mt-3 flex flex-wrap gap-1.5">
          <Badge variant={parsed.confidence > 0.6 ? 'accent' : 'muted'}>confianza {Math.round(parsed.confidence * 100)}%</Badge>
          {parsed.partial.goal && <Badge>{parsed.partial.goal}</Badge>}
          {parsed.partial.age && <Badge variant="muted">{parsed.partial.age}a</Badge>}
          {parsed.partial.weightKg && <Badge variant="muted">{parsed.partial.weightKg}kg</Badge>}
          {parsed.partial.targetWeightKg && <Badge variant="muted">→{parsed.partial.targetWeightKg}kg</Badge>}
          {parsed.partial.daysPerWeek && <Badge variant="muted">{parsed.partial.daysPerWeek}×/sem</Badge>}
          {parsed.partial.minsPerSession && <Badge variant="muted">{parsed.partial.minsPerSession}min</Badge>}
        </div>
        {parsed.warnings.length > 0 && (
          <p className="mt-2 text-xs text-accent">{parsed.warnings.join(' ')}</p>
        )}
        <div className="mt-3 flex gap-2">
          <Button variant="secondary" size="sm" onClick={applyParsed} disabled={parsed.confidence === 0}>
            Aplicar a formulario
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setText('')}>
            Limpiar
          </Button>
        </div>
      </Card>

      <Card>
        <h3 className="font-display text-base text-ink">Ajuste fino (6 campos)</h3>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
          <Input label="Edad" value={age} onChange={(e) => setAge(e.target.value)} inputMode="numeric" />
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium tracking-widest text-muted uppercase">Sexo</span>
            <FormSelect
              ariaLabel="Sexo"
              value={sex}
              onValueChange={(v) => setSex(v as never)}
              options={[
                { value: 'hombre', label: 'hombre' },
                { value: 'mujer', label: 'mujer' },
                { value: 'otro', label: 'otro' },
              ]}
            />
          </div>
          <Input label="Peso kg" value={weight} onChange={(e) => setWeight(e.target.value)} inputMode="decimal" />
          <Input label="Objetivo kg" value={target} onChange={(e) => setTarget(e.target.value)} inputMode="decimal" />
          <Input label="Altura cm" value={height} onChange={(e) => setHeight(e.target.value)} inputMode="numeric" />
          <FormSelect
            ariaLabel="Meta"
            value={goal}
            onValueChange={(v) => setGoal(v as Goal)}
            options={[
              { value: 'adelgazar', label: 'adelgazar' },
              { value: 'musculo', label: 'músculo' },
              { value: 'recomp', label: 'recomp' },
              { value: 'fuerza', label: 'fuerza' },
              { value: 'general', label: 'general' },
              { value: 'hibrido', label: 'híbrido' },
            ]}
          />
          <FormSelect
            ariaLabel="Nivel"
            value={level}
            onValueChange={(v) => setLevel(v as Level)}
            options={[
              { value: 'principiante', label: 'principiante' },
              { value: 'intermedio', label: 'intermedio' },
              { value: 'avanzado', label: 'avanzado' },
            ]}
          />
          <Input label="Días/sem" value={days} onChange={(e) => setDays(e.target.value)} inputMode="numeric" />
          <Input label="Min/sesión" value={mins} onChange={(e) => setMins(e.target.value)} inputMode="numeric" />
          <FormSelect
            ariaLabel="Material"
            value={equipment}
            onValueChange={(v) => setEquipment(v)}
            options={[
              { value: 'hibrido', label: 'híbrido' },
              { value: 'barbell', label: 'gym' },
              { value: 'bodyweight', label: 'casa/calistenia' },
            ]}
          />
          <FormSelect
            ariaLabel="Esfuerzo 1 a 5"
            value={effort}
            onValueChange={(v) => setEffort(v)}
            options={[
              { value: '1', label: '1 — suave (2h/sem)' },
              { value: '2', label: '2' },
              { value: '3', label: '3 — medio (5h/sem)' },
              { value: '4', label: '4' },
              { value: '5', label: '5 — alto (9h/sem)' },
            ]}
          />
        </div>
      </Card>

      <Card className={estimate.isUnrealistic ? 'border-accent/30 bg-accent-soft' : ''}>
        <h3 className="font-display text-lg text-ink">Estimación realista</h3>
        <p className="mt-1 text-sm text-muted">
          {input.weightKg}kg → {input.targetWeightKg ?? '—'}kg · {input.daysPerWeek}× {input.minsPerSession}min · esfuerzo {input.effort}
        </p>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-[var(--radius-md)] bg-surface-2 border border-line/40 px-3 py-2 text-center">
            <p className="text-xs tracking-widest text-muted uppercase">Estimado</p>
            <p className="font-display text-xl text-ink">{estimate.estimatedMonths} meses</p>
            <p className="text-xs text-muted">{estimate.estimatedWeeks} sem · {estimate.rateKgPerWeek} kg/sem</p>
          </div>
          <div className="rounded-[var(--radius-md)] bg-surface-2 border border-line/40 px-3 py-2 text-center">
            <p className="text-xs tracking-widest text-muted uppercase">Recomendado</p>
            <p className="font-display text-xl text-accent">{estimate.recommendedDuration}</p>
            <p className="text-xs text-muted">{estimate.milestones.length} hitos</p>
          </div>
          <div className="rounded-[var(--radius-md)] bg-surface-2 border border-line/40 px-3 py-2 text-center">
            <p className="text-xs tracking-widest text-muted uppercase">Pediste</p>
            <p className="font-display text-xl text-ink">{duration}</p>
            <p className="text-xs text-muted">{estimate.isUnrealistic ? 'no realista' : 'realista'}</p>
          </div>
        </div>
        {estimate.warnings.length > 0 && (
          <div className="mt-3 rounded-[var(--radius-md)] border border-accent/20 bg-surface px-3 py-2">
            {estimate.warnings.map((w) => (
              <p key={w} className="text-xs leading-4 text-accent">
                ⚠ {w}
              </p>
            ))}
          </div>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <span className="text-xs tracking-widest text-muted uppercase">Duración</span>
          {(['mensual', 'trimestral', 'semestral', 'anual'] as DurationKey[]).map((d) => (
            <button
              key={d}
              onClick={() => setDuration(d)}
              className={[
                'rounded-full border px-3 py-1 text-xs font-medium capitalize',
                duration === d ? 'border-accent bg-accent text-accent-contrast' : 'border-line bg-card text-muted',
              ].join(' ')}
            >
              {d}
            </button>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {estimate.milestones.slice(0, 6).map((m) => (
            <span key={m.week} className="rounded-full bg-surface-2 px-2.5 py-1 text-xs border border-line/40 text-ink-soft">
              s{m.week}: {m.weight ?? '·'}kg
            </span>
          ))}
          {estimate.milestones.length > 6 && <span className="text-xs text-muted">+{estimate.milestones.length - 6} más</span>}
        </div>
        <p className="mt-3 text-xs text-muted">No es consejo médico. Consulta profesional si tienes patologías.</p>
        <div className="mt-4 flex gap-2">
          <Button onClick={() => navigate({ to: '/planner' })} variant="secondary">
            Ver planner
          </Button>
          <Button
            onClick={() => {
              const id = createGeneratedPlan(input, duration)
              navigate({ to: '/generated/$id', params: { id } })
            }}
          >
            Generar plan
          </Button>
        </div>
      </Card>
    </div>
  )
}
