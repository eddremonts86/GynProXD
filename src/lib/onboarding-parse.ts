import type { OnboardingInput } from './types'

export interface ParseResult {
  partial: Partial<OnboardingInput>
  confidence: number
  warnings: string[]
}

const GOAL_MAP: Array<[RegExp, OnboardingInput['goal']]> = [
  [/adelgazar|perder peso|bajar peso|definir|cut/i, 'adelgazar'],
  [/ganar m[uú]sculo|hipertrofia|volumen|muscul/i, 'musculo'],
  [/fuerza|powerlifting/i, 'fuerza'],
  [/recomp|recompos/i, 'recomp'],
  [/h[ií]brido|mixto/i, 'hibrido'],
]

const LEVEL_MAP: Array<[RegExp, OnboardingInput['level']]> = [
  [/principiante|novato|empezando|nuevo/i, 'principiante'],
  [/intermedio|medio/i, 'intermedio'],
  [/avanzado|experto|alto nivel/i, 'avanzado'],
]

const EQUIP_MAP: Array<[RegExp, OnboardingInput['equipment']]> = [
  [/gym|gimnasio/i, 'barbell'],
  [/calistenia/i, 'bodyweight'],
  [/casa|home|sin material/i, 'bodyweight'],
  [/h[ií]brido/i, 'hibrido'],
]

export function parseOnboarding(text: string): ParseResult {
  const t = text.toLowerCase()
  const warnings: string[] = []
  const partial: Partial<OnboardingInput> = {}

  const ageM = t.match(/(\d{1,2})\s*(a[ñn]os)/i)
  if (ageM) partial.age = clampInt(Number(ageM[1]), 12, 80)

  if (/hombre|chico|var[oó]n/i.test(t)) partial.sex = 'hombre'
  else if (/mujer|chica/i.test(t)) partial.sex = 'mujer'
  else if (/otro|no binario/i.test(t)) partial.sex = 'otro'

  const weightMatches = [...t.matchAll(/(\d{2,3})\s*kg/g)].map((m) => Number(m[1]))
  if (weightMatches.length >= 2) {
    partial.weightKg = weightMatches[0]
    partial.targetWeightKg = weightMatches[1]
  } else if (weightMatches.length === 1) {
    if (/peso\s*\d+|peso.*\d+kg/i.test(t)) partial.weightKg = weightMatches[0]
    else partial.weightKg = weightMatches[0]
  }

  const targetA = t.match(/(?:a|hasta|objetivo|meta)\s*(\d{2,3})\s*kg/i)
  if (targetA) partial.targetWeightKg = Number(targetA[1])

  const heightM = t.match(/(\d{2,3})\s*cm|(\d\.\d{1,2})\s*m\b/i)
  if (heightM) {
    if (heightM[1]) partial.heightCm = Number(heightM[1])
    else if (heightM[2]) partial.heightCm = Math.round(Number(heightM[2]) * 100)
  }

  for (const [re, v] of GOAL_MAP) if (re.test(t)) { partial.goal = v; break }
  if (!partial.goal && partial.targetWeightKg !== undefined && partial.weightKg !== undefined) {
    if (partial.targetWeightKg < partial.weightKg) partial.goal = 'adelgazar'
    else if (partial.targetWeightKg > partial.weightKg) partial.goal = 'musculo'
  }

  for (const [re, v] of LEVEL_MAP) if (re.test(t)) { partial.level = v; break }

  for (const [re, v] of EQUIP_MAP) if (re.test(t)) { partial.equipment = v; break }

  const daysM = t.match(/(\d)\s*(veces|x)\s*(?:a la semana|por semana|semana)?/i) ?? t.match(/(\d)\s*d[ií]as/i)
  if (daysM) partial.daysPerWeek = clampInt(Number(daysM[1]), 1, 6)

  const hoursM = t.match(/(\d+(?:[.,]\d+)?)\s*h\b/i)
  const minsM = t.match(/(\d+)\s*min/i)
  if (hoursM) {
    const h = Number(hoursM[1].replace(',', '.'))
    partial.minsPerSession = clampInt(Math.round(h * 60), 30, 120)
  } else if (minsM) {
    partial.minsPerSession = clampInt(Number(minsM[1]), 30, 120)
  }

  const effortM = t.match(/esfuerzo\s*(bajo|medio|alto|\d)/i) ?? t.match(/effort\s*(low|medium|high|\d)/i)
  if (effortM) {
    const v = effortM[1].toLowerCase()
    if (v === 'bajo' || v === 'low' || v === '1') partial.effort = 1
    else if (v === 'medio' || v === 'medium' || v === '2' || v === '3') partial.effort = 3
    else if (v === 'alto' || v === 'high' || v === '4' || v === '5') partial.effort = 5
    else if (/\d/.test(v)) partial.effort = clampInt(Number(v), 1, 5) as OnboardingInput['effort']
  }

  let confidence = 0
  const fields: (keyof OnboardingInput)[] = ['age', 'weightKg', 'goal', 'daysPerWeek', 'minsPerSession', 'equipment']
  for (const f of fields) if (partial[f] !== undefined) confidence += 1
  confidence = Math.round((confidence / fields.length) * 100) / 100

  if (partial.weightKg && partial.targetWeightKg && partial.weightKg === partial.targetWeightKg) warnings.push('Peso objetivo igual al actual.')
  if (partial.age && (partial.age < 16 || partial.age > 75)) warnings.push('Edad fuera de rango — ajusta con profesional.')

  return { partial, confidence, warnings }
}

function clampInt(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(n)))
}

export function mergeWithDefaults(partial: Partial<OnboardingInput>): OnboardingInput {
  return {
    age: partial.age ?? 30,
    sex: partial.sex ?? 'otro',
    weightKg: partial.weightKg ?? 75,
    targetWeightKg: partial.targetWeightKg,
    heightCm: partial.heightCm ?? 175,
    goal: partial.goal ?? 'general',
    level: partial.level ?? 'principiante',
    daysPerWeek: partial.daysPerWeek ?? 3,
    minsPerSession: partial.minsPerSession ?? 60,
    equipment: (partial.equipment as OnboardingInput['equipment']) ?? 'hibrido',
    effort: (partial.effort as OnboardingInput['effort']) ?? 3,
    constraints: partial.constraints,
  }
}
