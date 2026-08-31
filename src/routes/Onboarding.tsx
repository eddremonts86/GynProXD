import { useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { ArrowLeft, ArrowRight, CircleNotch, MagicWand, Sparkle, Warning } from '@phosphor-icons/react'
import { PageHeader } from '../ui/PageHeader'
import { Panel } from '../ui/Panel'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { Tag } from '../ui/Tag'
import { FormSelect } from '../ui/FormSelect'
import { Textarea } from '@/components/ui/textarea'
import { WizardRail, type WizardStep } from '@/components/wizard-rail'
import { IntakeReview, type ReviewField, type Standing } from '@/components/intake-review'
import { DayPicker } from '@/components/day-picker'
import { InlineFitnessTest } from '@/components/inline-fitness-test'
import { estimatePlan } from '../lib/plan-estimate'
import { aiCoachEnabled, buildProgramme } from '../lib/ai-plan'
import { showNotification } from '../lib/notify'
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
import type { DayOfWeek, DurationKey, Goal, Level, OnboardingInput } from '../lib/types'

const GOALS: Goal[] = ['adelgazar', 'musculo', 'recomp', 'fuerza', 'general', 'hibrido']
const LEVELS: Level[] = ['principiante', 'intermedio', 'avanzado']

/**
 * Five steps, and the second one is the reason for the other four.
 *
 * This was one long form with a textarea bolted to the top of it. The textarea
 * filled the form when you asked it to, and whatever it got wrong went into a
 * programme unremarked — which matters because the parser is most confident
 * exactly when it is guessing. Splitting the form is what makes room for a step
 * whose only job is to show its work.
 *
 * `hint` shows only on the current step. A rail that explains all five at once
 * is a rail nobody reads.
 */
const STEPS: WizardStep[] = [
  { id: 'words', title: 'In your own words', hint: 'Optional, and the only place a "then" or an injury can live.' },
  { id: 'check', title: 'Check your data', hint: 'What was read, what was guessed, what was never said.' },
  { id: 'week', title: 'Your week', hint: 'Which days, how long, and where.' },
  { id: 'start', title: 'Where you start', hint: 'Experience, effort, and anything to train around.' },
  { id: 'review', title: 'Length and timeline', hint: 'The arithmetic, before anything is built.' },
]

export function OnboardingPage() {
  const navigate = useNavigate()
  const addGeneratedPlan = useGym((s) => s.addGeneratedPlan)
  const [designing, setDesigning] = useState(false)

  const [step, setStep] = useState(0)
  /* How far anyone has been, so the rail can offer a jump back without offering
     a jump past a screen they have never seen. */
  const [furthest, setFurthest] = useState(0)

  const [text, setText] = useState('')
  /* Saved profile details (Settings -> Profile) seed the form once, and a
     fitness-test result seeds level + effort the same way. */
  const [details] = useState(() => useGym.getState().profileDetails)
  const [test, setTest] = useState(() => useGym.getState().fitnessTest)
  const [age, setAge] = useState(details?.age ? String(details.age) : '35')
  const [sex, setSex] = useState<'hombre' | 'mujer' | 'otro'>(details?.sex ?? 'otro')
  const [weight, setWeight] = useState('80')
  const [target, setTarget] = useState('')
  const [height, setHeight] = useState(details?.heightCm ? String(details.heightCm) : '175')
  const [goal, setGoal] = useState<Goal>('general')
  const [level, setLevel] = useState<Level>(test?.strength ?? 'principiante')
  const [days, setDays] = useState('3')
  const [trainingDays, setTrainingDays] = useState<DayOfWeek[]>([])
  const [mins, setMins] = useState('60')
  const [place, setPlace] = useState('hibrido')
  const [effort, setEffort] = useState(test ? String(test.suggestedEffort) : '3')
  const [limitations, setLimitations] = useState('')
  const [avoid, setAvoid] = useState('')
  const [duration, setDuration] = useState<DurationKey>('trimestral')

  /**
   * Fields a person has changed by hand, which outrank anything read from prose.
   *
   * Applying the parsed sentence is not an edit — it is the machine filling in.
   * Only a keystroke on the field itself counts, and it moves the field out of
   * "I guessed this" and into "you decided this", where it stops being flagged.
   */
  const [touched, setTouched] = useState<Set<string>>(new Set())
  const mark = (key: string) => setTouched((t) => (t.has(key) ? t : new Set(t).add(key)))

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
        daysPerWeek: trainingDays.length || Number(days) || 3,
        minsPerSession: Number(mins) || 60,
        equipment: place as OnboardingInput['equipment'],
        effort: (Number(effort) || 3) as OnboardingInput['effort'],
        trainingDays: trainingDays.length > 0 ? trainingDays : undefined,
        limitations: limitations.trim() || undefined,
        avoid: avoid.trim() || undefined,
        constraints: text.trim() || undefined,
      }),
    [age, sex, weight, target, height, goal, level, days, trainingDays, mins, place, effort, limitations, avoid, text],
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
    if (p.trainingDays) setTrainingDays(p.trainingDays)
    if (p.minsPerSession) setMins(String(p.minsPerSession))
    if (p.equipment) setPlace(String(p.equipment))
    if (p.effort) setEffort(String(p.effort))
    if (p.limitations) setLimitations(p.limitations)
  }

  const generate = async () => {
    if (designing) return
    setDesigning(true)
    try {
      const plan = await buildProgramme(input, duration)
      addGeneratedPlan(plan)
      /* The designer is the fullest statement of who the person is, so persist
         its identity back: Settings, Today's BMI and the next design run all
         read the same source instead of drifting apart. */
      useGym
        .getState()
        .setProfileDetails({ age: input.age, sex: input.sex, heightCm: input.heightCm })
      /* Only pull the user to the result if they are still here waiting.
         The coach can take minutes; someone who wandered off would otherwise
         never learn their programme landed, so tell them where it is. */
      if (window.location.pathname === '/onboarding') {
        void navigate({ to: '/generated/$id', params: { id: plan.id } })
      } else {
        void showNotification(
          'Your programme is ready',
          `${plan.weeklyTemplate.name} is waiting under Planner.`,
          'training',
        )
      }
    } finally {
      setDesigning(false)
    }
  }

  const go = (next: number) => {
    const clamped = Math.max(0, Math.min(STEPS.length - 1, next))
    setStep(clamped)
    setFurthest((f) => Math.max(f, clamped))
    /* The panel changes under a scroll position that belonged to the old one. */
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const standingOf = (key: keyof OnboardingInput): Standing =>
    touched.has(key) ? 'edited' : (parsed.provenance[key] ?? 'default')

  const reviewFields: ReviewField[] = [
    {
      key: 'age',
      label: 'Age',
      display: age,
      standing: standingOf('age'),
      control: (
        <Input
          label="Age"
          value={age}
          onChange={(e) => { setAge(e.target.value); mark('age') }}
          inputMode="numeric"
        />
      ),
    },
    {
      key: 'sex',
      label: 'Sex',
      display: SEX_LABELS[sex],
      standing: standingOf('sex'),
      control: (
        <FormSelect
          label="Sex"
          value={sex}
          onValueChange={(v) => { setSex(v as typeof sex); mark('sex') }}
          options={(['hombre', 'mujer', 'otro'] as const).map((s) => ({ value: s, label: SEX_LABELS[s] }))}
        />
      ),
    },
    {
      key: 'heightCm',
      label: 'Height',
      display: `${height} cm`,
      standing: standingOf('heightCm'),
      control: (
        <Input
          label="Height"
          value={height}
          onChange={(e) => { setHeight(e.target.value); mark('heightCm') }}
          inputMode="numeric"
          suffix="cm"
        />
      ),
    },
    {
      key: 'weightKg',
      label: 'Weight',
      display: `${weight} kg`,
      standing: standingOf('weightKg'),
      control: (
        <Input
          label="Current weight"
          value={weight}
          onChange={(e) => { setWeight(e.target.value); mark('weightKg') }}
          inputMode="decimal"
          suffix="kg"
        />
      ),
    },
    {
      key: 'targetWeightKg',
      label: 'Target',
      display: target ? `${target} kg` : 'none',
      standing: standingOf('targetWeightKg'),
      control: (
        <Input
          label="Target weight"
          value={target}
          onChange={(e) => { setTarget(e.target.value); mark('targetWeightKg') }}
          inputMode="decimal"
          suffix="kg"
          placeholder="Optional"
        />
      ),
    },
    {
      key: 'goal',
      label: 'Goal',
      display: GOAL_LABELS[goal],
      standing: standingOf('goal'),
      control: (
        <FormSelect
          label="Goal"
          value={goal}
          onValueChange={(v) => { setGoal(v as Goal); mark('goal') }}
          options={GOALS.map((g) => ({ value: g, label: GOAL_LABELS[g] }))}
        />
      ),
    },
  ]

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Build a plan"
        description="enForma works out how long your goal actually takes at a safe rate, then builds the weeks around the time you have."
      />

      <div className="grid gap-6 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-10 lg:items-start">
        <div className="lg:sticky lg:top-6 lg:flex lg:flex-col lg:gap-6">
          <WizardRail steps={STEPS} current={step} furthest={furthest} onGo={go} />

          {/* The promise, small and always on. The full arithmetic is the last
              step; this is the one number that makes filling the rest feel like
              it is doing something. */}
          {!estimate.openEnded && (
            <div className="hidden border-t border-line pt-4 lg:flex lg:flex-col lg:gap-0.5">
              <span className="text-2xs text-ink-3">At a safe pace</span>
              <span className="num-dot text-2xl leading-none text-ink">
                {estimate.estimatedMonths}
                <span className="num ml-1.5 text-2xs font-normal text-ink-3">
                  {estimate.estimatedMonths === 1 ? 'month' : 'months'}
                </span>
              </span>
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          {/* Keyed on the step so React remounts it and the arrival animation
              replays — a panel that fades in only once is a panel that fades in
              at the wrong moment. */}
          <Panel key={STEPS[step].id} padding="lg" className="wizard-step flex flex-col gap-6">
            <div className="flex flex-col gap-1">
              <h2 className="text-lg text-ink">{STEPS[step].title}</h2>
              <p className="max-w-[62ch] text-2xs leading-snug text-ink-3">{STEPS[step].hint}</p>
            </div>

            {step === 0 && (
              <StepWords
                text={text}
                setText={setText}
                parsed={parsed}
                onApply={() => { applyParsed(); go(1) }}
              />
            )}

            {step === 1 && <IntakeReview fields={reviewFields} />}

            {step === 2 && (
              <StepWeek
                days={days}
                setDays={(v) => { setDays(v); mark('daysPerWeek') }}
                trainingDays={trainingDays}
                setTrainingDays={(d) => { setTrainingDays(d); mark('trainingDays') }}
                mins={mins}
                setMins={(v) => { setMins(v); mark('minsPerSession') }}
                place={place}
                setPlace={(v) => { setPlace(v); mark('equipment') }}
              />
            )}

            {step === 3 && (
              <StepStart
                level={level}
                setLevel={(v) => { setLevel(v); mark('level') }}
                effort={effort}
                setEffort={(v) => { setEffort(v); mark('effort') }}
                limitations={limitations}
                setLimitations={(v) => { setLimitations(v); mark('limitations') }}
                avoid={avoid}
                setAvoid={setAvoid}
                onTestResult={(r) => {
                  setTest(r)
                  setLevel(r.strength)
                  setEffort(String(r.suggestedEffort))
                }}
                testTakenAt={test?.takenAt}
              />
            )}

            {step === 4 && (
              <StepReview
                estimate={estimate}
                input={input}
                duration={duration}
                setDuration={setDuration}
                atLongestPlan={atLongestPlan}
                longestDuration={longestDuration}
              />
            )}
          </Panel>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button variant="ghost" onClick={() => go(step - 1)} disabled={step === 0}>
              <ArrowLeft size={16} weight="bold" />
              Back
            </Button>

            {step < STEPS.length - 1 ? (
              <Button variant="primary" onClick={() => go(step + 1)}>
                {step === 0 && text.trim().length === 0 ? 'Skip and fill it in' : 'Continue'}
                <ArrowRight size={16} weight="bold" />
              </Button>
            ) : (
              <Button variant="primary" size="lg" onClick={generate} disabled={designing}>
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
            )}
          </div>

          {designing && aiCoachEnabled() && (
            <p className="rounded-md bg-surface-2 p-3 text-2xs leading-relaxed text-ink-2">
              The coach usually takes a minute or two. You can keep using enForma; the programme
              will be waiting under Planner when it is ready.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

/* ── Step 1 ─────────────────────────────────────────────────────────────────── */

function StepWords({
  text,
  setText,
  parsed,
  onApply,
}: {
  text: string
  setText: (v: string) => void
  parsed: ReturnType<typeof parseOnboarding>
  onApply: () => void
}) {
  return (
    <div className="flex flex-col gap-4">
      <div
        className={cn(
          'flex flex-col gap-3 rounded-xl bg-surface-2 p-4',
          'transition-shadow duration-150 focus-within:ring-2 focus-within:ring-brand',
        )}
      >
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          placeholder="Un mes en casa de manera moderada y luego al gimnasio a tope. Peso 92 kilos, entreno lunes, miércoles y viernes. Cuidado con la rodilla izquierda."
          aria-label="Describe your situation"
          className="min-h-28 w-full resize-none border-0 bg-transparent px-0.5 py-0 text-sm leading-relaxed shadow-none focus-visible:border-0 focus-visible:ring-0 focus-visible:outline-none dark:bg-transparent"
        />
      </div>

      <p className="max-w-[62ch] text-2xs leading-relaxed text-ink-3">
        English or Spanish. Say it however you say it — a plan that changes after the first month, a
        knee to be careful with, the days you can actually make. Whatever the fields below cannot
        hold goes to the coach as you wrote it.
      </p>

      {text.trim().length > 0 && (
        <div className="flex flex-col gap-3 border-t border-line pt-4">
          <div className="flex flex-wrap items-center gap-1.5">
            <Tag tone={parsed.confidence > 0.5 ? 'good' : 'neutral'}>
              {Math.round(parsed.confidence * 100)}% read
            </Tag>
            {parsed.partial.age && <Tag>{parsed.partial.age} years</Tag>}
            {parsed.partial.weightKg && <Tag>{parsed.partial.weightKg} kg</Tag>}
            {parsed.partial.targetWeightKg && <Tag>target {parsed.partial.targetWeightKg} kg</Tag>}
            {parsed.partial.goal && <Tag>{GOAL_LABELS[parsed.partial.goal]}</Tag>}
            {parsed.partial.trainingDays && <Tag>{parsed.partial.trainingDays.join(' ')}</Tag>}
            {parsed.partial.minsPerSession && <Tag>{parsed.partial.minsPerSession} min</Tag>}
            {parsed.partial.limitations && <Tag tone="neutral">a limitation</Tag>}
          </div>

          {parsed.warnings.map((w) => (
            <p key={w} className="flex items-start gap-1.5 text-2xs leading-snug text-danger">
              <Warning size={14} className="mt-px shrink-0" />
              {w}
            </p>
          ))}

          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={onApply} disabled={parsed.confidence === 0}>
              <MagicWand size={15} />
              Use this and check it
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setText('')}>
              Clear
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Step 3 ─────────────────────────────────────────────────────────────────── */

function StepWeek({
  days,
  setDays,
  trainingDays,
  setTrainingDays,
  mins,
  setMins,
  place,
  setPlace,
}: {
  days: string
  setDays: (v: string) => void
  trainingDays: DayOfWeek[]
  setTrainingDays: (d: DayOfWeek[]) => void
  mins: string
  setMins: (v: string) => void
  place: string
  setPlace: (v: string) => void
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Input
          label="Sessions per week"
          value={trainingDays.length > 0 ? String(trainingDays.length) : days}
          onChange={(e) => setDays(e.target.value)}
          inputMode="numeric"
          disabled={trainingDays.length > 0}
          hint={trainingDays.length > 0 ? 'Set by the days you picked' : undefined}
        />
        <Input
          label="Minutes per session"
          value={mins}
          onChange={(e) => setMins(e.target.value)}
          inputMode="numeric"
          suffix="min"
        />
        <FormSelect
          label="Where you train"
          value={place}
          onValueChange={setPlace}
          options={TRAINING_PLACE_OPTIONS}
        />
      </div>

      <div className="border-t border-line pt-5">
        <DayPicker value={trainingDays} onChange={setTrainingDays} />
      </div>
    </div>
  )
}

/* ── Step 4 ─────────────────────────────────────────────────────────────────── */

function StepStart({
  level,
  setLevel,
  effort,
  setEffort,
  limitations,
  setLimitations,
  avoid,
  setAvoid,
  onTestResult,
  testTakenAt,
}: {
  level: Level
  setLevel: (v: Level) => void
  effort: string
  setEffort: (v: string) => void
  limitations: string
  setLimitations: (v: string) => void
  avoid: string
  setAvoid: (v: string) => void
  onTestResult: Parameters<typeof InlineFitnessTest>[0]['onResult']
  testTakenAt?: string
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormSelect
          label="Experience"
          value={level}
          onValueChange={(v) => setLevel(v as Level)}
          options={LEVELS.map((l) => ({ value: l, label: LEVEL_LABELS[l] }))}
        />
        <FormSelect
          label="How hard you want to push"
          value={effort}
          onValueChange={setEffort}
          options={[1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: EFFORT_LABELS[n] }))}
        />
      </div>

      <InlineFitnessTest key={testTakenAt ?? 'none'} onResult={onTestResult} />

      <div className="flex flex-col gap-4 border-t border-line pt-5">
        <div className="flex flex-col gap-1">
          <h3 className="text-xs font-semibold text-ink">Anything to train around</h3>
          <p className="max-w-[62ch] text-2xs leading-snug text-ink-3">
            The one thing here with a consequence. A movement that loads something sore gets left
            out rather than made lighter, so it is worth naming even if it feels minor.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label="Injuries or pain"
            value={limitations}
            onChange={(e) => setLimitations(e.target.value)}
            placeholder="Left knee, hurts going down"
          />
          <Input
            label="Movements you would rather not do"
            value={avoid}
            onChange={(e) => setAvoid(e.target.value)}
            placeholder="Burpees, running"
          />
        </div>
      </div>
    </div>
  )
}

/* ── Step 5 ─────────────────────────────────────────────────────────────────── */

function StepReview({
  estimate,
  input,
  duration,
  setDuration,
  atLongestPlan,
  longestDuration,
}: {
  estimate: ReturnType<typeof estimatePlan>
  input: OnboardingInput
  duration: DurationKey
  setDuration: (d: DurationKey) => void
  atLongestPlan: boolean
  longestDuration: DurationKey
}) {
  return (
    <div className="flex flex-col gap-5">
      {estimate.openEnded ? (
        <div className="flex flex-col gap-1.5 border-b border-line pb-4">
          <h3 className="text-sm font-semibold text-ink">No clock on this one</h3>
          <p className="max-w-[62ch] text-2xs leading-snug text-ink-3">
            Without a target weight there is no timeline to hit. Pick the length you want to commit
            to and enForma will periodise it.
          </p>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-1">
            <h3 className="text-sm font-semibold text-ink">What this actually takes</h3>
            <p className="text-2xs text-ink-3">
              {input.weightKg} kg{input.targetWeightKg ? ` to ${input.targetWeightKg} kg` : ''} at a
              safe pace
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
                duration === d ? 'bg-brand text-brand-ink' : 'bg-surface-2 text-ink-2 hover:text-ink',
              )}
            >
              {DURATION_LABELS[d]}
            </button>
          ))}
        </div>
        {!estimate.openEnded && !estimate.isUnrealistic && (
          <p className="text-2xs text-good">{DURATION_LABELS[duration]} fits the timeline.</p>
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
                {DURATION_LABELS[longestDuration]} is the longest plan enForma builds. It will cover
                the first stretch, and you can plan the rest once you get there.
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
              <span key={m.week} className="num rounded-full bg-surface-2 px-2 py-0.5 text-2xs text-ink-2">
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

      <p className="flex items-start gap-1.5 border-t border-line pt-4 text-2xs leading-snug text-ink-3">
        <Sparkle size={13} className="mt-px shrink-0" />
        {aiCoachEnabled()
          ? 'The AI coach designs the split and movements. Timelines and safe rates stay computed locally and are never up for negotiation.'
          : 'The AI coach is offline, so the standard template builder will design this programme.'}
      </p>

      <p className="text-2xs leading-snug text-ink-3">
        Builds {DURATION_LABELS[estimate.isUnrealistic ? estimate.recommendedDuration : duration]} of
        training. Estimates only, not medical advice. Talk to a professional if you have a condition
        that affects how you train or eat.
      </p>
    </div>
  )
}
