export type Equipment =
  | 'barbell'
  | 'dumbbell'
  | 'bodyweight'
  | 'machine'
  | 'cable'
  | 'kettlebell'
  | 'band'
  | 'other'

export type MuscleGroup =
  | 'chest'
  | 'back'
  | 'shoulders'
  | 'biceps'
  | 'triceps'
  | 'quads'
  | 'hamstrings'
  | 'glutes'
  | 'calves'
  | 'core'
  | 'other'

export interface Exercise {
  id: string
  name: string
  muscle: MuscleGroup
  equipment: Equipment
  image?: string | null
  instructions?: string[]
}

export interface SetEntry {
  weight: number
  reps: number
  durationSec?: number
  side?: 'L' | 'R'
}

export interface LoggedExercise {
  exerciseId: string
  sets: SetEntry[]
  supersetGroup?: string
}

export interface Workout {
  id: string
  date: string
  /** ISO timestamp. Absent on sessions recorded before durations were tracked. */
  startedAt?: string
  /** ISO timestamp, written when the session is finished. */
  endedAt?: string
  exercises: LoggedExercise[]
}

export interface BodyweightEntry {
  date: string
  kg: number
}

export type DayOfWeek = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'

export type ProgressionRule = 'none' | 'linear' | 'double'

export interface PlannedExercise {
  exerciseId: string
  progression: ProgressionRule
  supersetGroup?: string | null
  timed?: boolean
  unilateral?: boolean
}

export interface PlannedDay {
  day: DayOfWeek
  exercises: PlannedExercise[]
}

export interface WeeklyPlan {
  id: string
  name: string
  days: PlannedDay[]
  createdAt: string
}

export type Goal = 'adelgazar' | 'musculo' | 'recomp' | 'fuerza' | 'general' | 'hibrido'
export type Level = 'principiante' | 'intermedio' | 'avanzado'
export type DurationKey = 'mensual' | 'trimestral' | 'semestral' | 'anual'

export interface OnboardingInput {
  age: number
  sex: 'hombre' | 'mujer' | 'otro'
  weightKg: number
  targetWeightKg?: number
  heightCm?: number
  goal: Goal
  level: Level
  daysPerWeek: number
  minsPerSession: number
  equipment: Equipment | 'hibrido'
  effort: 1 | 2 | 3 | 4 | 5
  constraints?: string
}

export interface GeneratedDay {
  date: string
  day: DayOfWeek
  exercises: PlannedExercise[]
}

export interface GeneratedPlan {
  id: string
  createdAt: string
  input: OnboardingInput
  estimatedWeeks: number
  estimatedMonths: number
  rateKgPerWeek: number
  requestedDuration: DurationKey
  approvedDuration: DurationKey
  weeks: { weekIndex: number; days: GeneratedDay[] }[]
  weeklyTemplate: WeeklyPlan
  milestones: { week: number; weight?: number; note: string }[]
  warnings: string[]
}
