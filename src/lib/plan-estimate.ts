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

  if (input.goal === 'adelgazar' && deltaLoss > 0) {
    rate = rateForWeightLoss(input)
    estimatedWeeks = Math.ceil(deltaLoss / rate)
    if (input.targetWeightKg !== undefined) {
      const bmiTarget = input.heightCm ? input.targetWeightKg / ((input.heightCm / 100) ** 2) : 0
      if (bmiTarget > 0 && bmiTarget < 18.5) warnings.push('Objetivo por debajo de IMC saludable — consulta profesional.')
      if (deltaLoss > 30 && estimatedWeeks < 26) warnings.push('Pérdida grande — ritmo seguro requiere más tiempo.')
    }
  } else if ((input.goal === 'musculo' || input.goal === 'hibrido') && deltaGain > 0) {
    rate = rateForMuscleGain(input)
    estimatedWeeks = Math.ceil(deltaGain / rate)
  } else if (input.goal === 'recomp' && deltaLoss > 0) {
    rate = rateForWeightLoss(input) * 0.75
    estimatedWeeks = Math.ceil(deltaLoss / rate)
  } else if (input.goal === 'fuerza' || input.goal === 'general') {
    rate = 0
    estimatedWeeks = DURATION_WEEKS[requested] ?? 12
  } else {
    if (deltaLoss > 0) {
      rate = rateForWeightLoss(input)
      estimatedWeeks = Math.ceil(deltaLoss / rate)
    } else if (deltaGain > 0) {
      rate = rateForMuscleGain(input)
      estimatedWeeks = Math.ceil(deltaGain / rate)
    } else {
      estimatedWeeks = DURATION_WEEKS[requested] ?? 12
    }
  }

  estimatedWeeks = clamp(estimatedWeeks, 4, 104)

  const estimatedMonths = Math.ceil(estimatedWeeks / 4.3)

  let recommendedDuration: DurationKey = 'trimestral'
  const entries = Object.entries(DURATION_WEEKS) as [DurationKey, number][]
  let bestDiff = Infinity
  for (const [k, weeks] of entries) {
    const diff = Math.abs(weeks - estimatedWeeks)
    if (diff < bestDiff) {
      bestDiff = diff
      recommendedDuration = k
    }
  }

  const requestedWeeks = DURATION_WEEKS[requested] ?? 12
  const isUnrealistic = requestedWeeks < estimatedWeeks * 0.7

  if (isUnrealistic) {
    warnings.unshift(
      `Objetivo no realista en ${requested} (${requestedWeeks} sem). Estimado ${estimatedWeeks} sem (~${estimatedMonths} meses) a ${rate.toFixed(2)} kg/sem.`,
    )
  }

  const milestones: EstimateResult['milestones'] = []
  if (rate > 0 && (deltaLoss > 0 || deltaGain > 0)) {
    const totalDelta = deltaLoss > 0 ? deltaLoss : deltaGain
    const sign = deltaLoss > 0 ? -1 : 1
    for (let w = 4; w < estimatedWeeks; w += 4) {
      const prog = Math.min(totalDelta, rate * w)
      const weight = input.weightKg + sign * prog
      milestones.push({ week: w, weight: Math.round(weight * 10) / 10, note: `Sem ${w}` })
    }
    milestones.push({
      week: estimatedWeeks,
      weight: input.targetWeightKg,
      note: 'Objetivo',
    })
  } else {
    for (let w = 4; w <= estimatedWeeks; w += 4) milestones.push({ week: w, note: `Sem ${w}` })
  }

  if (!warnings.length && estimatedWeeks > 52) warnings.push('Plan largo — incluye deloads cada 4ª semana.')

  return {
    estimatedWeeks,
    estimatedMonths,
    rateKgPerWeek: Math.round(rate * 100) / 100,
    recommendedDuration,
    isUnrealistic,
    warnings,
    milestones,
  }
}
