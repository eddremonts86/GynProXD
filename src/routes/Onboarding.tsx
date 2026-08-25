import { useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { ArrowRight, CircleNotch, MagicWand, Sparkle, Warning } from '@phosphor-icons/react'
import { PageHeader, Section } from '../ui/PageHeader'
import { Panel } from '../ui/Panel'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { Tag } from '../ui/Tag'
import { FormSelect } from '../ui/FormSelect'
import { Textarea } from '@/components/ui/textarea'
import { estimatePlan } from '../lib/plan-estimate'
import { aiCoachEnabled, buildProgramme } from '../lib/ai-plan'
import { mergeWithDefaults, parseOnboarding } from '../lib/onboarding-parse'
import { useGym } from '../store/useGym'
import {
  DURATION_KEYS,
  DURATION_LABELS,
  EFFORT_LABELS,
  GOAL_LABELS,
  LEVEL_LABELS,
  SEX_LABELS,
  TRAINING_PLACE_OPTIONS,
} from '../lib/labels'
import { cn } from '@/lib/utils'
import type { DurationKey, Goal, Level, OnboardingInput } from '../lib/types'

const GOALS: Goal[] = ['adelgazar', 'musculo', 'recomp', 'fuerza', 'general', 'hibrido']
const LEVELS: Level[] = ['principiante', 'intermedio', 'avanzado']

export function OnboardingPage() {
  const navigate = useNavigate()
  const addGeneratedPlan = useGym((s) => s.addGeneratedPlan)
  const [designing, setDesigning] = useState(false)

  const [text, setText] = useState('')
  const [age, setAge] = useState('35')
  const [sex, setSex] = useState<'hombre' | 'mujer' | 'otro'>('otro')
  const [weight, setWeight] = useState('80')
  const [target, setTarget] = useState('')
  const [height, setHeight] = useState('175')
  const [goal, setGoal] = useState<Goal>('general')
  const [level, setLevel] = useState<Level>('principiante')
  const [days, setDays] = useState('3')
  const [mins, setMins] = useState('60')
  const [place, setPlace] = useState('hibrido')
  const [effort, setEffort] = useState('3')
  const [duration, setDuration] = useState<DurationKey>('trimestral')

  const parsed = useMemo(() => parseOnboarding(text), [text])

  const input: OnboardingInput = useMemo(
    () =>
      mergeWithDefaults({
        age: Number(age) || 30,
        sex,
        weightKg: Number(weight) || 75,
        targetWeightKg: Number(target) || undefined,
        heightCm: Number(height) || 175,
        goal,
        level,
        daysPerWeek: Number(days) || 3,
        minsPerSession: Number(mins) || 60,
        equipment: place as OnboardingInput['equipment'],
        effort: (Number(effort) || 3) as OnboardingInput['effort'],
      }),
    [age, sex, weight, target, height, goal, level, days, mins, place, effort],
  )

  const estimate = useMemo(() => estimatePlan(input, duration), [input, duration])

  /* Past the longest plan there is nothing left to switch to, only to explain. */
  const longestDuration = DURATION_KEYS[DURATION_KEYS.length - 1]
  const atLongestPlan = duration === longestDuration

  const applyParsed = () => {
    const p = parsed.partial
    if (p.age) setAge(String(p.age))
    if (p.sex) setSex(p.sex)
    if (p.weightKg) setWeight(String(p.weightKg))
    if (p.targetWeightKg) setTarget(String(p.targetWeightKg))
    if (p.heightCm) setHeight(String(p.heightCm))
    if (p.goal) setGoal(p.goal)
    if (p.level) setLevel(p.level)
    if (p.daysPerWeek) setDays(String(p.daysPerWeek))
    if (p.minsPerSession) setMins(String(p.minsPerSession))
    if (p.equipment) setPlace(String(p.equipment))
    if (p.effort) setEffort(String(p.effort))
  }

  const generate = async () => {
    if (designing) return
    setDesigning(true)
    try {
      const plan = await buildProgramme(input, duration)
      addGeneratedPlan(plan)
      /* Only pull the user to the result if they are still here waiting. */
      if (window.location.pathname === '/onboarding') {
        void navigate({ to: '/generated/$id', params: { id: plan.id } })
      }
    } finally {
      setDesigning(false)
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Build a plan"
        description="Forma works out how long your goal actually takes at a safe rate, then builds the weeks around the time you have."
      />

      <div className="grid gap-8 lg:grid-cols-[1fr_22rem] lg:items-start">
        <div className="flex flex-col gap-8">
          <Section title="Describe it in your own words" hint="Optional">
            <div
              className={cn(
                'flex flex-col gap-3 rounded-xl bg-surface p-4 shadow-[var(--shadow-panel)]',
                'transition-shadow duration-150 focus-within:ring-2 focus-within:ring-brand',
              )}
            >
              <Textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={3}
                placeholder="40 years old, 140kg, want to get down to 80kg, gym 3 times a week for 2 hours"
                aria-label="Describe your situation"
                className="min-h-20 w-full resize-none border-0 bg-transparent px-0.5 py-0 text-sm leading-relaxed shadow-none focus-visible:border-0 focus-visible:ring-0 focus-visible:outline-none dark:bg-transparent"
              />

              {text.trim().length > 0 && (
                <>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Tag tone={parsed.confidence > 0.5 ? 'good' : 'neutral'}>
                      {Math.round(parsed.confidence * 100)}% understood
                    </Tag>
                    {parsed.partial.goal && <Tag>{GOAL_LABELS[parsed.partial.goal]}</Tag>}
                    {parsed.partial.age && <Tag>{parsed.partial.age} years</Tag>}
                    {parsed.partial.weightKg && <Tag>{parsed.partial.weightKg} kg</Tag>}
                    {parsed.partial.targetWeightKg && (
                      <Tag>target {parsed.partial.targetWeightKg} kg</Tag>
                    )}
                    {parsed.partial.daysPerWeek && <Tag>{parsed.partial.daysPerWeek}×/week</Tag>}
                    {parsed.partial.minsPerSession && (
                      <Tag>{parsed.partial.minsPerSession} min</Tag>
                    )}
                  </div>

                  {parsed.warnings.map((w) => (
                    <p key={w} className="flex items-start gap-1.5 text-2xs text-danger">
                      <Warning size={14} className="mt-px shrink-0" />
                      {w}
                    </p>
                  ))}

                  <div className="flex gap-2 border-t border-line pt-3">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={applyParsed}
                      disabled={parsed.confidence === 0}
                    >
                      <MagicWand size={15} />
                      Fill the form
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setText('')}>
                      Clear
                    </Button>
                  </div>
                </>
              )}
            </div>
            <p className="text-2xs text-ink-3">
              English or Spanish both work. Anything it misses you can set below.
            </p>
          </Section>

          <Section title="Your details">
            <Panel padding="lg" className="flex flex-col gap-6">
              <fieldset className="flex flex-col gap-3">
                <legend className="pb-3 text-sm font-semibold text-ink">About you</legend>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  <Input
                    label="Age"
                    value={age}
                    onChange={(e) => setAge(e.target.value)}
                    inputMode="numeric"
                  />
                  <FormSelect
                    label="Sex"
                    value={sex}
                    onValueChange={(v) => setSex(v as typeof sex)}
                    options={(['hombre', 'mujer', 'otro'] as const).map((s) => ({
                      value: s,
                      label: SEX_LABELS[s],
                    }))}
                  />
                  <Input
                    label="Height"
                    value={height}
                    onChange={(e) => setHeight(e.target.value)}
                    inputMode="numeric"
                    suffix="cm"
                  />
                  <Input
                    label="Current weight"
                    value={weight}
                    onChange={(e) => setWeight(e.target.value)}
                    inputMode="decimal"
                    suffix="kg"
                  />
                  <Input
                    label="Target weight"
                    value={target}
                    onChange={(e) => setTarget(e.target.value)}
                    inputMode="decimal"
                    suffix="kg"
                    placeholder="Optional"
                  />
                  <FormSelect
                    label="Goal"
                    value={goal}
                    onValueChange={(v) => setGoal(v as Goal)}
                    options={GOALS.map((g) => ({ value: g, label: GOAL_LABELS[g] }))}
                  />
                </div>
              </fieldset>

              <fieldset className="flex flex-col gap-3 border-t border-line pt-5">
                <legend className="float-left pb-3 text-sm font-semibold text-ink">Training</legend>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  <Input
                    label="Sessions per week"
                    value={days}
                    onChange={(e) => setDays(e.target.value)}
                    inputMode="numeric"
                  />
                  <Input
                    label="Minutes per session"
                    value={mins}
                    onChange={(e) => setMins(e.target.value)}
                    inputMode="numeric"
                    suffix="min"
                  />
                  <FormSelect
                    label="Experience"
                    value={level}
                    onValueChange={(v) => setLevel(v as Level)}
                    options={LEVELS.map((l) => ({ value: l, label: LEVEL_LABELS[l] }))}
                  />
                  <FormSelect
                    label="Where you train"
                    value={place}
                    onValueChange={setPlace}
                    options={TRAINING_PLACE_OPTIONS}
                  />
                  <FormSelect
                    label="How hard you want to push"
                    value={effort}
                    onValueChange={setEffort}
                    options={[1, 2, 3, 4, 5].map((n) => ({
                      value: String(n),
                      label: EFFORT_LABELS[n],
                    }))}
                    className="xl:col-span-1"
                  />
                </div>
              </fieldset>
            </Panel>
          </Section>
        </div>

        {/* The estimate updates as you type. Showing the maths is the product. */}
        <div className="lg:sticky lg:top-6">
          <Panel padding="lg" className="flex flex-col gap-5">
            {estimate.openEnded ? (
              <div className="flex flex-col gap-1.5 border-b border-line pb-4">
                <h2 className="text-lg text-ink">No clock on this one</h2>
                <p className="text-sm text-ink-3">
                  Without a target weight there is no timeline to hit. Pick the length you want to
                  commit to and Forma will periodise it.
                </p>
              </div>
            ) : (
              <>
                <div className="flex flex-col gap-1">
                  <h2 className="text-lg text-ink">What this actually takes</h2>
                  <p className="text-2xs text-ink-3">
                    {input.weightKg} kg
                    {input.targetWeightKg ? ` to ${input.targetWeightKg} kg` : ''} at a safe pace
                  </p>
                </div>

                <div className="flex flex-col gap-4 border-y border-line py-4">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-sm text-ink-3">Realistic timeline</span>
                    <span className="num-dot text-4xl leading-none text-ink">
                      {estimate.estimatedMonths}
                      <span className="num ml-1.5 text-xs font-normal text-ink-3">
                        {estimate.estimatedMonths === 1 ? 'month' : 'months'}
                      </span>
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-sm text-ink-3">Safe rate</span>
                    <span className="num text-lg leading-none font-semibold text-ink">
                      {estimate.rateKgPerWeek}
                      <span className="ml-1 text-2xs font-normal text-ink-3">kg / week</span>
                    </span>
                  </div>
                </div>
              </>
            )}

            <div className="flex flex-col gap-2">
              <span className="text-2xs font-medium text-ink-3">Plan length</span>
              <div className="flex flex-wrap gap-1.5">
                {DURATION_KEYS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDuration(d)}
                    aria-pressed={duration === d}
                    className={cn(
                      'min-h-10 rounded-full px-3.5 text-xs font-medium transition-colors duration-150',
                      duration === d
                        ? 'bg-brand text-brand-ink'
                        : 'bg-surface-2 text-ink-2 hover:text-ink',
                    )}
                  >
                    {DURATION_LABELS[d]}
                  </button>
                ))}
              </div>
              {!estimate.openEnded && !estimate.isUnrealistic && (
                <p className="text-2xs text-good">
                  {DURATION_LABELS[duration]} fits the timeline.
                </p>
              )}
            </div>

            {estimate.isUnrealistic ? (
              <div className="flex gap-2.5 rounded-md bg-danger-soft p-3">
                <Warning size={18} weight="fill" className="mt-px shrink-0 text-danger" />
                <div className="flex flex-col gap-1.5">
                  <p className="text-sm font-medium text-danger">
                    {DURATION_LABELS[duration]} is not enough
                  </p>
                  {estimate.warnings.map((w) => (
                    <p key={w} className="text-2xs text-ink-2">
                      {w}
                    </p>
                  ))}
                  {atLongestPlan ? (
                    <p className="text-2xs text-ink-2">
                      {DURATION_LABELS[longestDuration]} is the longest plan Forma builds. It will
                      cover the first stretch, and you can plan the rest once you get there.
                    </p>
                  ) : (
                    <Button
                      size="sm"
                      variant="secondary"
                      className="mt-1 self-start"
                      onClick={() => setDuration(estimate.recommendedDuration)}
                    >
                      Switch to {DURATION_LABELS[estimate.recommendedDuration]}
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              estimate.warnings.length > 0 && (
                <div className="flex flex-col gap-1.5 rounded-md bg-surface-2 p-3">
                  {estimate.warnings.map((w) => (
                    <p key={w} className="text-2xs text-ink-2">
                      {w}
                    </p>
                  ))}
                </div>
              )
            )}

            {estimate.milestones.length > 0 && (
              <div className="flex flex-col gap-2">
                <span className="text-2xs font-medium text-ink-3">Checkpoints</span>
                <div className="flex flex-wrap gap-1.5">
                  {estimate.milestones.slice(0, 6).map((m) => (
                    <span
                      key={m.week}
                      className="num rounded-full bg-surface-2 px-2 py-0.5 text-2xs text-ink-2"
                    >
                      Week {m.week}
                      {m.weight !== undefined ? `, ${m.weight} kg` : ''}
                    </span>
                  ))}
                  {estimate.milestones.length > 6 && (
                    <span className="num self-center text-2xs text-ink-3">
                      +{estimate.milestones.length - 6}
                    </span>
                  )}
                </div>
              </div>
            )}

            <Button size="lg" onClick={generate} disabled={designing} className="w-full">
              {designing ? (
                <>
                  <CircleNotch size={18} weight="bold" className="animate-spin" />
                  Designing your programme
                </>
              ) : (
                <>
                  Design my programme
                  <ArrowRight size={18} weight="bold" />
                </>
              )}
            </Button>

            {designing && aiCoachEnabled && (
              <p className="rounded-md bg-surface-2 p-3 text-2xs leading-relaxed text-ink-2">
                The coach usually takes a minute or two. You can keep using Forma; the programme
                will be waiting under Planner when it is ready.
              </p>
            )}

            <p className="flex items-start gap-1.5 text-2xs text-ink-3">
              <Sparkle size={13} className="mt-px shrink-0" />
              {aiCoachEnabled
                ? 'The AI coach designs the split and movements. Timelines and safe rates stay computed locally and are never up for negotiation.'
                : 'The AI coach is offline, so the standard template builder will design this programme.'}
            </p>

            <p className="text-2xs text-ink-3">
              Builds {DURATION_LABELS[estimate.isUnrealistic ? estimate.recommendedDuration : duration]}{' '}
              of training. Estimates only, not medical advice. Talk to a professional if you have a
              condition that affects how you train or eat.
            </p>
          </Panel>
        </div>
      </div>
    </div>
  )
}
