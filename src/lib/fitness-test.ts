import type { Level } from './types'

/**
 * The five-minute self-test: three 60-second max-effort stations with rest
 * between them. Scoring maps to the same Level vocabulary the programme
 * designer already speaks, on two axes — strength (push-ups + squats) and
 * cardio (high knees) — because "strong but winded" and "fit but weak" are
 * different members. Numbers are editorial bands, deliberately forgiving:
 * the test exists to place people, not to judge them.
 */

export interface FitnessTestInput {
  /** Max push-ups in 60s. Knee push-ups count. */
  pushups: number
  /** Max bodyweight squats in 60s. */
  squats: number
  /** Max high knees in 60s, counting each right knee. */
  highKnees: number
}

export interface FitnessTestResult {
  takenAt: string
  input: FitnessTestInput
  strength: Level
  cardio: Level
  suggestedEffort: 1 | 2 | 3 | 4 | 5
}

const LEVEL_SCORE: Record<Level, number> = { principiante: 0, intermedio: 1, avanzado: 2 }
const SCORE_LEVEL: Level[] = ['principiante', 'intermedio', 'avanzado']

function band(value: number, mid: number, high: number): Level {
  if (value >= high) return 'avanzado'
  if (value >= mid) return 'intermedio'
  return 'principiante'
}

export function scoreFitnessTest(input: FitnessTestInput, takenAt: string): FitnessTestResult {
  const pushBand = band(input.pushups, 10, 26)
  const squatBand = band(input.squats, 20, 41)
  /* Strength is the weaker of the two: a plan must fit the lagging half. */
  const strength = SCORE_LEVEL[Math.min(LEVEL_SCORE[pushBand], LEVEL_SCORE[squatBand])]
  const cardio = band(input.highKnees, 60, 101)
  const avg = (LEVEL_SCORE[strength] + LEVEL_SCORE[cardio]) / 2
  const suggestedEffort = (avg >= 1.5 ? 4 : avg >= 0.5 ? 3 : 2) as 2 | 3 | 4
  return { takenAt, input, strength, cardio, suggestedEffort }
}

/** Eight weeks between tests keeps the levels honest without nagging. */
export const RETEST_AFTER_DAYS = 56

export function testAgeDays(result: FitnessTestResult, todayIso: string): number {
  const ms = Date.parse(todayIso) - Date.parse(result.takenAt)
  return Math.max(0, Math.floor(ms / 86_400_000))
}

export function testIsStale(result: FitnessTestResult, todayIso: string): boolean {
  return testAgeDays(result, todayIso) >= RETEST_AFTER_DAYS
}
