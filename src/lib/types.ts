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
  /** Session goal from the intensity dial. A target, never a cap. */
  targetSets?: number
}

/** Session-time volume dial. I/II/III pick the target sets per movement. */
export type Intensity = 'I' | 'II' | 'III'

export interface Workout {
  id: string
  date: string
  /** ISO timestamp. Absent on sessions recorded before durations were tracked. */
  startedAt?: string
  /** ISO timestamp, written when the session is finished. */
  endedAt?: string
  /** The member declared they went past what the plan asked. */
  ec?: boolean
  /** The volume dial the session ran at. Absent on freeform sessions. */
  intensity?: Intensity
  exercises: LoggedExercise[]
}

export interface BodyweightEntry {
  /** Row id. Absent on weigh-ins logged before the store became record-shaped. */
  id?: string
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
  /** One optional "if you have more" line for the day. Absent on older plans. */
  ecNote?: string
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

/** Personal details kept inside the encrypted profile snapshot. */
export interface ProfileDetails {
  age?: number
  sex?: 'hombre' | 'mujer' | 'otro'
  heightCm?: number
}

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
  ecNote?: string
}

export interface GeneratedPlan {
  id: string
  createdAt: string
  /** Who designed the structure. Absent on plans stored before the AI coach. */
  source?: 'coach' | 'standard'
  /** One short paragraph from the coach about how the programme is built. */
  coachNotes?: string
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
