import type { OnboardingInput } from './types'

export interface ParseResult {
  partial: Partial<OnboardingInput>
  confidence: number
  warnings: string[]
}

/**
 * Free-text intake. The vocabulary is bilingual on purpose: the UI is English
 * but the original users describe themselves in Spanish, and a box that
 * silently ignores half of what is typed into it is worse than no box.
 */

const GOAL_MAP: Array<[RegExp, OnboardingInput['goal']]> = [
  [/adelgazar|perder peso|bajar peso|definir|lose (?:fat|weight)|slim down|cut(?:ting)?\b/i, 'adelgazar'],
  [/ganar m[uú]sculo|hipertrofia|volumen|muscul|build muscle|hypertroph|bulk/i, 'musculo'],
  [/fuerza|powerlifting|strength|get strong/i, 'fuerza'],
  [/recomp|recompos/i, 'recomp'],
  [/h[ií]brido|mixto|hybrid/i, 'hibrido'],
]

const LEVEL_MAP: Array<[RegExp, OnboardingInput['level']]> = [
  [/principiante|novato|empezando|nuevo|beginner|novice|just start|new to/i, 'principiante'],
  [/intermedio|medio|intermediate/i, 'intermedio'],
  [/avanzado|experto|alto nivel|advanced|experienced/i, 'avanzado'],
]

const EQUIP_MAP: Array<[RegExp, OnboardingInput['equipment']]> = [
  [/h[ií]brido|hybrid/i, 'hibrido'],
  [/calistenia|calisthenics|bodyweight|no equipment|sin material/i, 'bodyweight'],
  [/gym|gimnasio|barbell|weights/i, 'barbell'],
  [/casa|home/i, 'bodyweight'],
]

export function parseOnboarding(text: string): ParseResult {
  const t = text.toLowerCase()
  const warnings: string[] = []
  const partial: Partial<OnboardingInput> = {}

  const ageM =
    t.match(/(\d{1,2})\s*(?:a[ñn]os|a[ñn]o)\b/i) ??
    t.match(/(\d{1,2})\s*(?:years? old|yo|yrs?)\b/i) ??
    t.match(/\bage[:\s]+(\d{1,2})\b/i)
  if (ageM) partial.age = clampInt(Number(ageM[1]), 12, 80)

  if (/hombre|chico|var[oó]n|\bmale\b|\bman\b|\bguy\b/i.test(t)) partial.sex = 'hombre'
  else if (/mujer|chica|\bfemale\b|\bwoman\b/i.test(t)) partial.sex = 'mujer'
  else if (/otro|no binario|non[- ]?binary/i.test(t)) partial.sex = 'otro'

  const weightMatches = [...t.matchAll(/(\d{2,3})\s*kg/g)].map((m) => Number(m[1]))
  if (weightMatches.length >= 2) {
    partial.weightKg = weightMatches[0]
    partial.targetWeightKg = weightMatches[1]
  } else if (weightMatches.length === 1) {
    partial.weightKg = weightMatches[0]
  }

  const targetM =
    t.match(/(?:a|hasta|objetivo|meta)\s*(\d{2,3})\s*kg/i) ??
    t.match(/(?:to|down to|target|goal(?:\s+weight)?(?:\s+of)?)\s*(\d{2,3})\s*kg/i) ??
    t.match(/(?:→|->)\s*(\d{2,3})\s*kg/i)
  if (targetM) partial.targetWeightKg = Number(targetM[1])

  const heightM = t.match(/(\d{2,3})\s*cm/i) ?? t.match(/(\d\.\d{1,2})\s*m\b/i)
  if (heightM) {
    const raw = Number(heightM[1])
    partial.heightCm = raw < 3 ? Math.round(raw * 100) : raw
  }

  for (const [re, v] of GOAL_MAP)
    if (re.test(t)) {
      partial.goal = v
      break
    }
  if (!partial.goal && partial.targetWeightKg !== undefined && partial.weightKg !== undefined) {
    if (partial.targetWeightKg < partial.weightKg) partial.goal = 'adelgazar'
    else if (partial.targetWeightKg > partial.weightKg) partial.goal = 'musculo'
  }

  for (const [re, v] of LEVEL_MAP)
    if (re.test(t)) {
      partial.level = v
      break
    }

  for (const [re, v] of EQUIP_MAP)
    if (re.test(t)) {
      partial.equipment = v
      break
    }

  const daysM =
    t.match(/(\d)\s*(?:veces|x)\s*(?:a la semana|por semana|semana|\/?\s*(?:a\s*)?week|weekly)?/i) ??
    t.match(/(\d)\s*(?:d[ií]as|days)/i) ??
    t.match(/(\d)\s*times?\s*(?:a|per)\s*week/i)
  if (daysM) partial.daysPerWeek = clampInt(Number(daysM[1]), 1, 6)

  const hoursM = t.match(/(\d+(?:[.,]\d+)?)\s*(?:h\b|hours?|hrs?\b)/i)
  const minsM = t.match(/(\d+)\s*(?:min|minutes?)/i)
  if (hoursM) {
    partial.minsPerSession = clampInt(Math.round(Number(hoursM[1].replace(',', '.')) * 60), 30, 120)
  } else if (minsM) {
    partial.minsPerSession = clampInt(Number(minsM[1]), 30, 120)
  }

  const effortM = t.match(/(?:esfuerzo|effort|intensity)\s*(bajo|medio|alto|low|medium|high|\d)/i)
  if (effortM) {
    const v = effortM[1].toLowerCase()
    if (v === 'bajo' || v === 'low' || v === '1') partial.effort = 1
    else if (v === 'medio' || v === 'medium' || v === '2' || v === '3') partial.effort = 3
    else if (v === 'alto' || v === 'high' || v === '4' || v === '5') partial.effort = 5
    else if (/\d/.test(v)) partial.effort = clampInt(Number(v), 1, 5) as OnboardingInput['effort']
  }

  const fields: (keyof OnboardingInput)[] = [
    'age',
    'weightKg',
    'goal',
    'daysPerWeek',
    'minsPerSession',
    'equipment',
  ]
  const found = fields.filter((f) => partial[f] !== undefined).length
  const confidence = Math.round((found / fields.length) * 100) / 100

  if (partial.weightKg && partial.targetWeightKg && partial.weightKg === partial.targetWeightKg) {
    warnings.push('Your target weight matches your current weight.')
  }
  if (partial.age && (partial.age < 16 || partial.age > 75)) {
    warnings.push('That age is outside the range these estimates were built for.')
  }

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
