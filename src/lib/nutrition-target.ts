import { estimatePlan } from './plan-estimate'
import type { OnboardingInput } from './types'

/**
 * Energy and protein targets, computed locally from the same onboarding input
 * that paces the training plan. The AI coach may describe these numbers but
 * never produces them: "realistic over optimistic" applies to food too.
 */

export interface NutritionTarget {
  bmr: number
  tdee: number
  /** Daily energy target, rounded to 10 kcal and never below 1200. */
  kcalTarget: number
  /** Daily protein target in grams, from bodyweight and goal. */
  proteinG: number
  direction: 'deficit' | 'surplus' | 'maintain'
  /** Signed daily energy delta against maintenance. */
  deltaKcal: number
  /** True when height was missing and 170 cm was assumed; copy should hedge. */
  heightAssumed: boolean
}

/** What a single main meal should look like, for querying and for ranking. */
export interface MealTargets {
  kcalMin: number
  kcalMax: number
  proteinMinG: number
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}

/** Grams of protein per kg of bodyweight. Cutting goals sit higher because
 * protein is what spares muscle in a deficit. */
const PROTEIN_PER_KG: Record<OnboardingInput['goal'], number> = {
  adelgazar: 2.0,
  recomp: 2.0,
  musculo: 1.8,
  fuerza: 1.8,
  hibrido: 1.7,
  general: 1.6,
}

const ASSUMED_HEIGHT_CM = 170

/** Mifflin-St Jeor. 'otro' takes the midpoint of the two published constants. */
export function basalMetabolicRate(
  sex: OnboardingInput['sex'],
  weightKg: number,
  heightCm: number,
  age: number,
): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age
  const constant = sex === 'hombre' ? 5 : sex === 'mujer' ? -161 : -78
  return Math.round(base + constant)
}

/**
 * Activity multiplier from training frequency. Deliberately coarse: the
 * difference between 1.5 and 1.55 is smaller than day-to-day kitchen noise.
 */
export function activityFactor(daysPerWeek: number): number {
  return clamp(1.35 + 0.05 * daysPerWeek, 1.4, 1.7)
}

export function nutritionTargetFor(input: OnboardingInput): NutritionTarget {
  const heightAssumed = input.heightCm === undefined
  const heightCm = input.heightCm ?? ASSUMED_HEIGHT_CM
  const bmr = basalMetabolicRate(input.sex, input.weightKg, heightCm, input.age)
  const tdee = Math.round(bmr * activityFactor(input.daysPerWeek))

  const target = input.targetWeightKg
  const direction: NutritionTarget['direction'] =
    target === undefined || target === input.weightKg
      ? 'maintain'
      : target < input.weightKg
        ? 'deficit'
        : 'surplus'

  /*
   * The weekly rate comes from the same estimate that paces the plan, so the
   * kitchen and the gym never disagree about speed. 7700 kcal/kg is the
   * standard figure for fat; gaining muscle is not pure energy arithmetic,
   * which is why the surplus is clamped to a conventional lean-gain band
   * rather than trusting the formula.
   */
  let deltaKcal = 0
  if (direction !== 'maintain') {
    const rate = estimatePlan(input).rateKgPerWeek
    const raw = Math.round((rate * 7700) / 7)
    deltaKcal =
      direction === 'deficit' ? -clamp(raw, 250, 750) : clamp(raw, 200, 500)
  }

  const kcalTarget = Math.max(1200, Math.round((tdee + deltaKcal) / 10) * 10)
  const proteinG = Math.round(input.weightKg * PROTEIN_PER_KG[input.goal])

  return { bmr, tdee, kcalTarget, proteinG, direction, deltaKcal, heightAssumed }
}

/** A main meal is roughly a third of the day, with headroom for real recipes. */
export function mealTargets(target: NutritionTarget): MealTargets {
  return {
    kcalMin: Math.round(target.kcalTarget * 0.25),
    kcalMax: Math.round(target.kcalTarget * 0.4),
    proteinMinG: Math.round(target.proteinG * 0.3),
  }
}
