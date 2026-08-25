import type {
  DayOfWeek,
  DurationKey,
  Equipment,
  Goal,
  Level,
  MuscleGroup,
  ProgressionRule,
} from './types'

/**
 * The persisted domain vocabulary is Spanish (it predates the English UI and is
 * written into localStorage), so display strings are mapped here rather than
 * migrating stored data. Never render a raw domain value.
 */

export const GOAL_LABELS: Record<Goal, string> = {
  adelgazar: 'Lose fat',
  musculo: 'Build muscle',
  recomp: 'Recomposition',
  fuerza: 'Strength',
  general: 'General fitness',
  hibrido: 'Hybrid',
}

export const LEVEL_LABELS: Record<Level, string> = {
  principiante: 'Beginner',
  intermedio: 'Intermediate',
  avanzado: 'Advanced',
}

export const DURATION_LABELS: Record<DurationKey, string> = {
  mensual: '1 month',
  trimestral: '3 months',
  semestral: '6 months',
  anual: '12 months',
}

export const DURATION_KEYS: DurationKey[] = ['mensual', 'trimestral', 'semestral', 'anual']

export const SEX_LABELS: Record<'hombre' | 'mujer' | 'otro', string> = {
  hombre: 'Male',
  mujer: 'Female',
  otro: 'Prefer not to say',
}

export const EQUIPMENT_LABELS: Record<Equipment | 'hibrido', string> = {
  barbell: 'Barbell',
  dumbbell: 'Dumbbell',
  bodyweight: 'Bodyweight',
  machine: 'Machine',
  cable: 'Cable',
  kettlebell: 'Kettlebell',
  band: 'Band',
  other: 'Other',
  hibrido: 'Hybrid',
}

/** The onboarding "where do you train" question, which is coarser than Equipment. */
export const TRAINING_PLACE_OPTIONS: { value: string; label: string }[] = [
  { value: 'hibrido', label: 'Gym and home' },
  { value: 'barbell', label: 'Full gym' },
  { value: 'bodyweight', label: 'Home, bodyweight' },
]

export const MUSCLE_LABELS: Record<MuscleGroup, string> = {
  chest: 'Chest',
  back: 'Back',
  shoulders: 'Shoulders',
  biceps: 'Biceps',
  triceps: 'Triceps',
  quads: 'Quads',
  hamstrings: 'Hamstrings',
  glutes: 'Glutes',
  calves: 'Calves',
  core: 'Core',
  other: 'Other',
}

/** Three-letter codes for the typographic tile shown when a movement has no artwork. */
export const MUSCLE_SHORT: Record<MuscleGroup, string> = {
  chest: 'CHE',
  back: 'BCK',
  shoulders: 'SHO',
  biceps: 'BIC',
  triceps: 'TRI',
  quads: 'QUA',
  hamstrings: 'HAM',
  glutes: 'GLU',
  calves: 'CAL',
  core: 'COR',
  other: 'GEN',
}

export const PROGRESSION_LABELS: Record<ProgressionRule, string> = {
  none: 'No progression',
  linear: 'Linear',
  double: 'Double',
}

/** Plain-language explanations, shown wherever a progression rule is offered. */
export const PROGRESSION_HELP: Record<ProgressionRule, string> = {
  none: 'Repeat what you did last time. Nothing is added automatically.',
  linear: 'Add 2.5 kg every session at the same reps.',
  double: 'Keep the weight and build reps to the top of the range, then add 2.5 kg and start again.',
}

export const DAY_FULL_LABELS: Record<DayOfWeek, string> = {
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
  sun: 'Sunday',
}

export const EFFORT_LABELS: Record<number, string> = {
  1: 'Easy, about 2h a week',
  2: 'Light',
  3: 'Moderate, about 5h a week',
  4: 'Hard',
  5: 'Very hard, about 9h a week',
}

/** "12 Mar" style, from an ISO yyyy-mm-dd string, without pulling in a date lib. */
export function formatShortDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export function formatLongDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds))
  const m = Math.floor(s / 60)
  return `${m}:${String(s % 60).padStart(2, '0')}`
}

export function pluralize(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`
}
