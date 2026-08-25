import { generatedExercises } from '../data/exercises-generated'
import { estimatePlan, DURATION_WEEKS } from './plan-estimate'
import { toLocalIso } from './dates'
import type { DurationKey, GeneratedDay, GeneratedPlan, OnboardingInput, WeeklyPlan, PlannedDay, DayOfWeek } from './types'

const DURATION_MONTHS: Record<DurationKey, number> = {
  mensual: 1,
  trimestral: 3,
  semestral: 6,
  anual: 12,
}

/** Plan names are shown in the UI, so they use the English vocabulary. */
const GOAL_PLAN_NAMES: Record<OnboardingInput['goal'], string> = {
  adelgazar: 'Fat loss',
  musculo: 'Muscle',
  recomp: 'Recomposition',
  fuerza: 'Strength',
  general: 'General fitness',
  hibrido: 'Hybrid',
}


const DAYS: DayOfWeek[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']

type SplitDay = { label: string; muscles: string[] }

const SPLITS: Record<number, SplitDay[]> = {
  2: [
    { label: 'Full A', muscles: ['chest', 'back', 'quads', 'shoulders', 'core'] },
    { label: 'Full B', muscles: ['back', 'chest', 'hamstrings', 'biceps', 'glutes'] },
  ],
  3: [
    { label: 'Full A', muscles: ['chest', 'back', 'quads', 'shoulders', 'triceps'] },
    { label: 'Full B', muscles: ['back', 'chest', 'hamstrings', 'glutes', 'biceps'] },
    { label: 'Full C', muscles: ['quads', 'chest', 'back', 'shoulders', 'core'] },
  ],
  4: [
    { label: 'Upper', muscles: ['chest', 'back', 'shoulders', 'biceps', 'triceps'] },
    { label: 'Lower', muscles: ['quads', 'hamstrings', 'glutes', 'calves'] },
    { label: 'Upper', muscles: ['chest', 'back', 'shoulders', 'biceps', 'triceps'] },
    { label: 'Lower', muscles: ['quads', 'hamstrings', 'glutes', 'core'] },
  ],
  5: [
    { label: 'Push', muscles: ['chest', 'shoulders', 'triceps'] },
    { label: 'Pull', muscles: ['back', 'biceps', 'hamstrings'] },
    { label: 'Legs', muscles: ['quads', 'hamstrings', 'glutes', 'calves'] },
    { label: 'Upper', muscles: ['chest', 'back', 'shoulders'] },
    { label: 'Lower', muscles: ['quads', 'glutes', 'core'] },
  ],
  6: [
    { label: 'Push', muscles: ['chest', 'shoulders', 'triceps'] },
    { label: 'Pull', muscles: ['back', 'biceps', 'hamstrings'] },
    { label: 'Legs', muscles: ['quads', 'hamstrings', 'glutes'] },
    { label: 'Push', muscles: ['chest', 'shoulders', 'triceps'] },
    { label: 'Pull', muscles: ['back', 'biceps', 'hamstrings'] },
    { label: 'Legs', muscles: ['quads', 'glutes', 'core'] },
  ],
}

function pickExercise(muscle: string, equipment: OnboardingInput['equipment'], level: string): string {
  const pool = generatedExercises.filter((e) => {
    if (equipment === 'hibrido') return true
    if (equipment === 'bodyweight') return e.equipment === 'bodyweight'
    if (equipment === 'barbell') return ['barbell', 'dumbbell', 'machine', 'cable'].includes(e.equipment)
    return e.equipment === equipment
  })
  const candidates = pool.filter((e) => e.muscle === muscle)
  const chosen = candidates.length > 0 ? candidates : pool.filter((e) => e.muscle !== 'other')
  const sorted = [...chosen].sort((a, b) => a.name.localeCompare(b.name))
  const idx = level === 'principiante' ? 0 : level === 'intermedio' ? 1 % sorted.length : 2 % sorted.length
  return sorted[idx]?.id ?? sorted[0]?.id ?? generatedExercises[0].id
}

function progressionFor(effort: number, equipment: string): 'none' | 'linear' | 'double' {
  if (equipment === 'bodyweight') return effort >= 4 ? 'linear' : 'none'
  if (effort <= 2) return 'none'
  if (effort <= 3) return 'linear'
  return 'double'
}

function dayOfWeekForIndex(_week: number, dayIdx: number, daysPerWeek: number): DayOfWeek {
  const order: DayOfWeek[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
  if (daysPerWeek <= 3) {
    const map = [0, 2, 4]
    return order[map[dayIdx] ?? dayIdx] ?? 'mon'
  }
  if (daysPerWeek === 4) {
    const map = [0, 1, 3, 4]
    return order[map[dayIdx] ?? dayIdx] ?? 'mon'
  }
  if (daysPerWeek === 5) {
    const map = [0, 1, 2, 3, 5]
    return order[map[dayIdx] ?? dayIdx] ?? 'mon'
  }
  return order[dayIdx % 7] as DayOfWeek
}

export function generatePlan(input: OnboardingInput, requested: DurationKey, startDate = new Date()): GeneratedPlan {
  const estimate = estimatePlan(input, requested)
  const approvedDuration: DurationKey = estimate.isUnrealistic ? estimate.recommendedDuration : requested
  const actualWeeks = DURATION_WEEKS[approvedDuration] ?? estimate.estimatedWeeks

  const split = SPLITS[input.daysPerWeek] ?? SPLITS[3]
  const prog = progressionFor(input.effort, input.equipment)

  const weeklyDays: PlannedDay[] = DAYS.map((d) => ({ day: d, exercises: [] }))
  split.forEach((s, idx) => {
    const dow = dayOfWeekForIndex(0, idx, input.daysPerWeek)
    const target = weeklyDays.find((x) => x.day === dow)
    if (!target) return
    s.muscles.forEach((m) => {
      const id = pickExercise(m, input.equipment, input.level)
      if (!target.exercises.some((e) => e.exerciseId === id)) {
        target.exercises.push({ exerciseId: id, progression: prog })
      }
    })
  })

  const weeklyTemplate: WeeklyPlan = {
    id: `plan-gen-${Date.now()}`,
    name: `${GOAL_PLAN_NAMES[input.goal]} · ${DURATION_MONTHS[approvedDuration]} months`,
    days: weeklyDays,
    createdAt: new Date().toISOString(),
  }

  const weeks: GeneratedPlan['weeks'] = []
  const start = new Date(startDate)
  start.setHours(0, 0, 0, 0)
  const dayToOffset: Record<DayOfWeek, number> = { mon: 0, tue: 1, wed: 2, thu: 3, fri: 4, sat: 5, sun: 6 }
  const startDay = (start.getDay() + 6) % 7

  for (let w = 0; w < actualWeeks; w++) {
    const isDeload = (w + 1) % 4 === 0
    const days: GeneratedDay[] = weeklyDays
      .filter((d) => d.exercises.length > 0)
      .map((d) => {
        let exercises = d.exercises
        if (isDeload) exercises = exercises.slice(0, Math.max(2, exercises.length - 2)).map((e) => ({ ...e, progression: 'none' as const }))
        const offset = ((dayToOffset[d.day] ?? 0) - startDay + 7) % 7 + w * 7
        const date = new Date(start)
        date.setDate(start.getDate() + offset)
        return {
          date: toLocalIso(date),
          day: d.day,
          exercises,
        }
      })
    weeks.push({ weekIndex: w, days })
  }

  const id = `gen-${Date.now()}`
  return {
    id,
    createdAt: new Date().toISOString(),
    input,
    estimatedWeeks: estimate.estimatedWeeks,
    estimatedMonths: estimate.estimatedMonths,
    rateKgPerWeek: estimate.rateKgPerWeek,
    requestedDuration: requested,
    approvedDuration,
    weeks,
    weeklyTemplate,
    milestones: estimate.milestones,
    warnings: estimate.warnings,
  }
}
