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
}

export interface LoggedExercise {
  exerciseId: string
  sets: SetEntry[]
}

export interface Workout {
  id: string
  date: string
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
