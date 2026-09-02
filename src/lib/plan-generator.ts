import { generatedExercises } from '../data/exercises-generated'
import { isWithdrawn } from './withdrawn'
import { estimatePlan, DURATION_WEEKS } from './plan-estimate'
import { toLocalIso } from './dates'
import { DURATION_LABELS } from './labels'
import type { BlockPlan, DurationKey, GeneratedDay, GeneratedPlan, OnboardingInput, WeeklyPlan, PlannedDay, DayOfWeek } from './types'

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

/**
 * Proven staples per muscle, in teaching order. Alphabetical picking used to
 * hand beginners "Anti-Gravity Press" as a chest opener; the classics come
 * first now, and the alphabetical tail only serves the later blocks.
 */
const STAPLES: Record<string, string[]> = {
  chest: ['Barbell_Bench_Press_-_Medium_Grip', 'Pushups', 'Dumbbell_Bench_Press', 'Incline_Dumbbell_Press'],
  back: ['Bent_Over_Two-Dumbbell_Row', 'Pullups', 'Seated_Cable_Rows', 'Wide-Grip_Lat_Pulldown'],
  shoulders: ['Barbell_Shoulder_Press', 'Dumbbell_Shoulder_Press', 'Side_Lateral_Raise'],
  biceps: ['Barbell_Curl', 'Dumbbell_Bicep_Curl', 'Hammer_Curls'],
  triceps: ['Triceps_Pushdown', 'Dips_-_Triceps_Version', 'Lying_Triceps_Press'],
  quads: ['Barbell_Full_Squat', 'Goblet_Squat', 'Leg_Press', 'Bodyweight_Squat'],
  hamstrings: ['Romanian_Deadlift', 'Lying_Leg_Curls', 'Glute_Ham_Raise'],
  glutes: ['Barbell_Hip_Thrust', 'Barbell_Glute_Bridge', 'Butt_Lift_Bridge'],
  calves: ['Standing_Calf_Raises', 'Seated_Calf_Raise', 'Standing_Dumbbell_Calf_Raise'],
  core: ['Plank', 'Crunches', 'Hanging_Leg_Raise'],
}

/**
 * A stretch and a lift can train the same muscle, and only one of them is a
 * working set. Block rotation walks past the staples into the alphabetical
 * tail, so without this the fourth block of a hamstring slot could hand
 * somebody a banded hamstring stretch as their main movement.
 */
const TRAINABLE = new Set(['strength', 'plyometrics', 'strongman', 'olympic'])

/**
 * Every movement the athlete's equipment allows — and the one chokepoint the
 * whole programme runs through. `pickExercise` draws from it, the coach's
 * grounding list is built from it, and the validator that accepts or rejects
 * the coach's answer checks against it. So a movement withdrawn in the admin
 * panel stops being programmed here, once, rather than in three places that
 * would drift apart.
 */
function allowedPool(equipment: OnboardingInput['equipment']) {
  return generatedExercises.filter((e) => {
    if (isWithdrawn(e.id)) return false
    if (e.category && !TRAINABLE.has(e.category)) return false
    if (equipment === 'hibrido') return true
    if (equipment === 'bodyweight') return e.equipment === 'bodyweight'
    if (equipment === 'barbell') return ['barbell', 'dumbbell', 'machine', 'cable'].includes(e.equipment)
    return e.equipment === equipment
  })
}

/**
 * `block` is the 4-week training block index. Each block walks one step down
 * the candidate list, so a long programme rotates movements instead of
 * repeating the same week for a year.
 */
function pickExercise(
  muscle: string,
  equipment: OnboardingInput['equipment'],
  level: string,
  block: number,
): string {
  const pool = allowedPool(equipment)
  const poolIds = new Set(pool.map((e) => e.id))
  const staples = (STAPLES[muscle] ?? []).filter((id) => poolIds.has(id))
  const rest = pool
    .filter((e) => e.muscle === muscle && !staples.includes(e.id))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((e) => e.id)
  const candidates = [...staples, ...rest]
  if (candidates.length === 0) {
    const fallback = pool.filter((e) => e.muscle !== 'other').sort((a, b) => a.name.localeCompare(b.name))
    /* The last resort still has to be a movement somebody is allowed to see. */
    return fallback[0]?.id ?? pool[0]?.id ?? generatedExercises.find((e) => !isWithdrawn(e.id))!.id
  }
  const levelOffset = level === 'principiante' ? 0 : level === 'intermedio' ? 1 : 2
  return candidates[(levelOffset + block) % candidates.length]
}

/**
 * The "if you have more" line for the standard template: one per day, so a
 * plan built without the coach still offers something to the member who
 * finishes with fuel left. Additive and never required — the same contract
 * the coach is held to.
 */
const EC_TEMPLATES: string[] = [
  'Add one more set on the first movement.',
  'Finish with a 90 second plank.',
  'Take 30 seconds less rest between sets.',
  'Add 10 slow reps of the last movement.',
  'Close with 5 minutes of brisk walking.',
  'Hold the last rep of every set for 3 seconds.',
]

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

/** The duration maths shared by every plan designer, human-coded or not. */
export function resolveDuration(input: OnboardingInput, requested: DurationKey) {
  const estimate = estimatePlan(input, requested)
  const approvedDuration: DurationKey = estimate.isUnrealistic
    ? estimate.recommendedDuration
    : requested
  const weeks = DURATION_WEEKS[approvedDuration] ?? estimate.estimatedWeeks
  return { estimate, approvedDuration, weeks }
}

/**
 * Grounding list for the AI coach: per muscle, the movements it is allowed to
 * pick, staples first, filtered by the user's equipment.
 */
export function candidateIdsByMuscle(
  equipment: OnboardingInput['equipment'],
  perMuscle = 10,
): Record<string, string[]> {
  const pool = allowedPool(equipment)
  const poolIds = new Set(pool.map((e) => e.id))
  const result: Record<string, string[]> = {}
  for (const muscle of Object.keys(STAPLES)) {
    const staples = (STAPLES[muscle] ?? []).filter((id) => poolIds.has(id))
    const rest = pool
      .filter((e) => e.muscle === muscle && !staples.includes(e.id))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((e) => e.id)
    result[muscle] = [...staples, ...rest].slice(0, perMuscle)
  }
  return result
}

/** Every movement id the athlete's equipment allows; the coach may use no others. */
export function allowedExerciseIds(equipment: OnboardingInput['equipment']): Set<string> {
  return new Set(allowedPool(equipment).map((e) => e.id))
}

export interface ProgrammeStructure {
  source: 'coach' | 'standard'
  name?: string
  coachNotes?: string
  /** One block per four weeks, cycled across the calendar. */
  blocks: BlockPlan[]
}

/** Turns a designed structure into a dated calendar with deloads applied. */
export function assemblePlan(
  input: OnboardingInput,
  requested: DurationKey,
  structure: ProgrammeStructure,
  startDate = new Date(),
): GeneratedPlan {
  const { estimate, approvedDuration, weeks: actualWeeks } = resolveDuration(input, requested)
  const blocks = structure.blocks.length > 0 ? structure.blocks : [{ days: [] }]
  const weeklyDays = blocks[0].days

  const weeklyTemplate: WeeklyPlan = {
    id: `plan-gen-${crypto.randomUUID()}`,
    name: structure.name ?? `${GOAL_PLAN_NAMES[input.goal]} · ${DURATION_LABELS[approvedDuration]}`,
    days: weeklyDays,
    createdAt: new Date().toISOString(),
  }

  const weeks: GeneratedPlan['weeks'] = []
  const start = new Date(startDate)
  start.setHours(0, 0, 0, 0)
  const dayToOffset: Record<DayOfWeek, number> = { mon: 0, tue: 1, wed: 2, thu: 3, fri: 4, sat: 5, sun: 6 }
  const startDay = (start.getDay() + 6) % 7

  /**
   * Weeks are calendar weeks, counted from a Monday.
   *
   * They used to be a rolling seven days from whenever the plan began, which
   * put the Monday session at the *end* of every week: a plan started on a
   * Tuesday read "Week 1 — Monday 7th, Wednesday 2nd, Friday 4th". No date was
   * wrong and the whole thing read as a bug, in every week rather than only the
   * first.
   *
   * So the grid is anchored to a Monday and the first week keeps whatever
   * training days are left in it. `firstMonday` is the offset from the start
   * date to that Monday — negative, into the week already under way.
   *
   * Unless nothing is left of it. Somebody who begins on a Sunday with a
   * Monday/Wednesday/Friday week has no session to place, and an empty first
   * week is worse than starting on the Monday they would have started on
   * anyway — so the grid moves forward and nothing is dropped.
   */
  const trainingDays = blocks[0].days.filter((d) => d.exercises.length > 0)
  const anyLeftThisWeek = trainingDays.some((d) => (dayToOffset[d.day] ?? 0) >= startDay)
  const firstMonday = anyLeftThisWeek ? -startDay : 7 - startDay

  for (let w = 0; w < actualWeeks; w++) {
    const isDeload = (w + 1) % 4 === 0
    const blockIndex = Math.floor(w / 4) % blocks.length
    const days: GeneratedDay[] = blocks[blockIndex].days
      .filter((d) => d.exercises.length > 0)
      .map((d) => {
        let exercises = d.exercises
        if (isDeload) exercises = exercises.slice(0, Math.max(2, exercises.length - 2)).map((e) => ({ ...e, progression: 'none' as const }))
        const offset = firstMonday + (dayToOffset[d.day] ?? 0) + w * 7
        const date = new Date(start)
        date.setDate(start.getDate() + offset)
        return {
          date: toLocalIso(date),
          day: d.day,
          exercises,
          /* A deload week is the one week extra work would undo. */
          ecNote: isDeload ? undefined : d.ecNote,
          /* Negative only in the first week, for a day already gone. */
          past: offset < 0,
        }
      })
      /* Dropped rather than shown greyed out: a session that was over before
         the plan existed is not something anybody missed. */
      .filter((d) => !d.past)
      .map(({ past: _past, ...day }) => day)
    weeks.push({ weekIndex: w, blockIndex, days })
  }

  return {
    id: `gen-${crypto.randomUUID()}`,
    createdAt: new Date().toISOString(),
    source: structure.source,
    coachNotes: structure.coachNotes,
    input,
    estimatedWeeks: estimate.estimatedWeeks,
    estimatedMonths: estimate.estimatedMonths,
    rateKgPerWeek: estimate.rateKgPerWeek,
    requestedDuration: requested,
    approvedDuration,
    weeks,
    /* Metadata only. The days live in `weeks`, already expanded onto dates, and
       a second copy of them here would be a second thing to keep in step. */
    blocks: blocks.map(({ days: _days, ...meta }) => meta),
    weeklyTemplate,
    milestones: estimate.milestones,
    warnings: estimate.warnings,
  }
}

export function generatePlan(input: OnboardingInput, requested: DurationKey, startDate = new Date()): GeneratedPlan {
  const { weeks: actualWeeks } = resolveDuration(input, requested)
  const split = SPLITS[input.daysPerWeek] ?? SPLITS[3]
  const prog = progressionFor(input.effort, input.equipment)

  /** One weekly layout per 4-week block, so long programmes rotate movements. */
  const blockCount = Math.max(1, Math.ceil(actualWeeks / 4))
  const buildWeek = (block: number): PlannedDay[] => {
    const days: PlannedDay[] = DAYS.map((d) => ({ day: d, exercises: [] }))
    split.forEach((s, idx) => {
      const dow = dayOfWeekForIndex(0, idx, input.daysPerWeek)
      const target = days.find((x) => x.day === dow)
      if (!target) return
      s.muscles.forEach((m) => {
        const id = pickExercise(m, input.equipment, input.level, block)
        if (!target.exercises.some((e) => e.exerciseId === id)) {
          target.exercises.push({ exerciseId: id, progression: prog })
        }
      })
      target.ecNote = EC_TEMPLATES[idx % EC_TEMPLATES.length]
    })
    return days
  }
  /* The deterministic designer does not phase: it varies movements per block
     and nothing else, so every block inherits the programme's own place. It is
     the fallback for a coach that did not answer, and inventing a periodisation
     it was never asked for would be the wrong kind of initiative. */
  const blocks = Array.from({ length: blockCount }, (_, b) => ({ days: buildWeek(b) }))

  return assemblePlan(input, requested, { source: 'standard', blocks }, startDate)
}
