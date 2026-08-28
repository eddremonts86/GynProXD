import type { DurationKey, Level, OnboardingInput } from './types'

export const DURATION_WEEKS: Record<DurationKey, number> = {
  mensual: 4,
  trimestral: 12,
  semestral: 24,
  anual: 52,
}

export interface EstimateResult {
  estimatedWeeks: number
  estimatedMonths: number
  rateKgPerWeek: number
  recommendedDuration: DurationKey
  isUnrealistic: boolean
  /**
   * True when there is no weight target to pace against: the timeline is the
   * user's choice, and no "realistic timeline" exists to echo back at them.
   */
  openEnded: boolean
  warnings: string[]
  milestones: { week: number; weight?: number; note: string }[]
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}

function rateForWeightLoss(input: OnboardingInput): number {
  const effortMap: Record<number, number> = { 1: 0.4, 2: 0.55, 3: 0.7, 4: 0.85, 5: 1.0 }
  let rate = effortMap[input.effort] ?? 0.7
  if (input.age > 60) rate *= 0.8
  else if (input.age > 45) rate *= 0.9
  if (input.daysPerWeek >= 5) rate += 0.08
  else if (input.daysPerWeek <= 2) rate -= 0.07
  return clamp(rate, 0.3, 1.0)
}

function rateForMuscleGain(input: OnboardingInput): number {
  const base: Record<Level, number> = { principiante: 0.35, intermedio: 0.18, avanzado: 0.09 }
  let rate = base[input.level] ?? 0.18
  const effortFactor: Record<number, number> = { 1: 0.6, 2: 0.8, 3: 1, 4: 1.2, 5: 1.35 }
  rate *= effortFactor[input.effort] ?? 1
  if (input.age > 45) rate *= 0.85
  return clamp(rate, 0.04, 0.5)
}

export function estimatePlan(
  input: OnboardingInput,
  requested: DurationKey = 'trimestral',
): EstimateResult {
  const warnings: string[] = []
  let estimatedWeeks = 12
  let rate = 0

  const deltaLoss =
    input.targetWeightKg !== undefined ? Math.max(0, input.weightKg - input.targetWeightKg) : 0
  const deltaGain =
    input.targetWeightKg !== undefined ? Math.max(0, input.targetWeightKg - input.weightKg) : 0

  /*
   * A weight target drives the timeline regardless of the stated goal: the
   * goal shapes the training split, not the arithmetic. Previously "strength"
   * or "general fitness" silently ignored the target and echoed the requested
   * length back as a "realistic timeline", which was circular nonsense.
   */
  const openEnded = deltaLoss === 0 && deltaGain === 0

  if (deltaLoss > 0) {
    rate = rateForWeightLoss(input) * (input.goal === 'recomp' ? 0.75 : 1)
    rate = Math.round(rate * 100) / 100
    estimatedWeeks = Math.ceil(deltaLoss / rate)
    const bmiTarget =
      input.heightCm && input.targetWeightKg !== undefined
        ? input.targetWeightKg / ((input.heightCm / 100) ** 2)
        : 0
    if (bmiTarget > 0 && bmiTarget < 18.5) {
      warnings.push('That target sits below a healthy BMI. Please talk to a professional first.')
    }
    if (deltaLoss > 30 && estimatedWeeks < 26) {
      warnings.push('Losing this much safely takes longer than the plan you picked.')
    }
  } else if (deltaGain > 0) {
    rate = rateForMuscleGain(input)
    estimatedWeeks = Math.ceil(deltaGain / rate)
  } else {
    rate = 0
    estimatedWeeks = DURATION_WEEKS[requested] ?? 12
  }

  estimatedWeeks = clamp(estimatedWeeks, 4, 104)

  const estimatedMonths = Math.ceil(estimatedWeeks / 4.3)

  /* The shortest option that actually fits the goal, not the nearest one:
     recommending a duration below estimatedWeeks contradicts the estimate we
     just showed. Past the longest option there is nothing left to suggest. */
  const entries = (Object.entries(DURATION_WEEKS) as [DurationKey, number][]).sort(
    (a, b) => a[1] - b[1],
  )
  const recommendedDuration: DurationKey =
    entries.find(([, weeks]) => weeks >= estimatedWeeks)?.[0] ?? entries[entries.length - 1][0]

  const requestedWeeks = DURATION_WEEKS[requested] ?? 12
  const isUnrealistic = !openEnded && requestedWeeks < estimatedWeeks * 0.7

  if (isUnrealistic) {
    const requestedMonths = Math.max(1, Math.round(requestedWeeks / 4.345))
    warnings.unshift(
      `At a safe ${rate.toFixed(2)} kg per week this goal needs about ${estimatedMonths} months, ` +
        `more than the ${requestedMonths} you asked for.`,
    )
  }

  const milestones: EstimateResult['milestones'] = []
  if (rate > 0 && (deltaLoss > 0 || deltaGain > 0)) {
    const totalDelta = deltaLoss > 0 ? deltaLoss : deltaGain
    const sign = deltaLoss > 0 ? -1 : 1
    for (let w = 4; w < estimatedWeeks; w += 4) {
      const prog = Math.min(totalDelta, rate * w)
      const weight = input.weightKg + sign * prog
      milestones.push({ week: w, weight: Math.round(weight * 10) / 10, note: `Week ${w}` })
    }
    milestones.push({
      week: estimatedWeeks,
      weight: input.targetWeightKg,
      note: 'Target',
    })
  }

  if (!warnings.length && estimatedWeeks > 52) {
    warnings.push('A plan this long includes a lighter deload week every fourth week.')
  }

  return {
    openEnded,
    estimatedWeeks,
    estimatedMonths,
    rateKgPerWeek: Math.round(rate * 100) / 100,
    recommendedDuration,
    isUnrealistic,
    warnings,
    milestones,
  }
}
