import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  BodyweightEntry,
  DayOfWeek,
  DurationKey,
  Exercise,
  GeneratedPlan,
  OnboardingInput,
  PlannedExercise,
  ProgressionRule,
  WeeklyPlan,
  Workout,
} from '../lib/types'
import { generatedExercises } from '../data/exercises-generated'
import { populateByIdCache } from '../lib/exercises'
import { generatePlan } from '../lib/plan-generator'

export const DAYS: DayOfWeek[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
export const DAY_LABELS: Record<DayOfWeek, string> = {
  mon: 'Mon',
  tue: 'Tue',
  wed: 'Wed',
  thu: 'Thu',
  fri: 'Fri',
  sat: 'Sat',
  sun: 'Sun',
}

function createEmptyDays(): WeeklyPlan['days'] {
  return DAYS.map((d) => ({ day: d, exercises: [] }))
}

interface GymState {
  customExercises: Exercise[]
  workouts: Workout[]
  bodyweight: BodyweightEntry[]
  activeWorkout: Workout | null
  plans: WeeklyPlan[]
  generatedPlans: GeneratedPlan[]
  addExercise: (e: Exercise) => void
  startWorkout: () => void
  startWorkoutFromPlan: (planId: string, day: DayOfWeek) => void
  discardWorkout: () => void
  addSet: (exerciseId: string, weight: number, reps: number) => void
  finishWorkout: () => void
  logBodyweight: (kg: number) => void
  importData: (json: unknown) => boolean
  createPlan: (name: string) => string
  renamePlan: (id: string, name: string) => void
  deletePlan: (id: string) => void
  addExerciseToDay: (planId: string, day: DayOfWeek, exerciseId: string) => void
  removeExerciseFromDay: (planId: string, day: DayOfWeek, exerciseId: string) => void
  updateExerciseProgression: (
    planId: string,
    day: DayOfWeek,
    exerciseId: string,
    rule: ProgressionRule,
  ) => void
  createGeneratedPlan: (input: OnboardingInput, requested: DurationKey) => string
  deleteGeneratedPlan: (id: string) => void
  saveGeneratedAsPlan: (generatedId: string) => string | null
}

const today = () => new Date().toISOString().slice(0, 10)

populateByIdCache(generatedExercises)

export const useGym = create<GymState>()(
  persist(
    (set, get) => ({
      customExercises: [],
      workouts: [],
      bodyweight: [],
      activeWorkout: null,
      plans: [],
      generatedPlans: [],

      addExercise: (e) =>
        set((s) => {
          if (s.customExercises.some((x) => x.id === e.id)) return s
          if (generatedExercises.some((x) => x.id === e.id)) return s
          const next = [...s.customExercises, e]
          populateByIdCache([e])
          return { customExercises: next }
        }),

      startWorkout: () =>
        set({ activeWorkout: { id: crypto.randomUUID(), date: today(), exercises: [] } }),

      startWorkoutFromPlan: (planId, day) =>
        set((s) => {
          const plan = s.plans.find((p) => p.id === planId)
          const planned = plan?.days.find((d) => d.day === day)
          const exercises = (planned?.exercises ?? []).map((pe) => ({
            exerciseId: pe.exerciseId,
            sets: [] as { weight: number; reps: number }[],
          }))
          return { activeWorkout: { id: crypto.randomUUID(), date: today(), exercises } }
        }),

      discardWorkout: () => set({ activeWorkout: null }),

      addSet: (exerciseId, weight, reps) =>
        set((s) => {
          if (!s.activeWorkout) return s
          const w = structuredClone(s.activeWorkout)
          let ex = w.exercises.find((e) => e.exerciseId === exerciseId)
          if (!ex) {
            ex = { exerciseId, sets: [] }
            w.exercises.push(ex)
          }
          ex.sets.push({ weight, reps })
          return { activeWorkout: w }
        }),

      finishWorkout: () =>
        set((s) => {
          if (!s.activeWorkout || s.activeWorkout.exercises.length === 0) {
            return { activeWorkout: null }
          }
          return {
            workouts: [s.activeWorkout, ...s.workouts],
            activeWorkout: null,
          }
        }),

      logBodyweight: (kg) =>
        set((s) => ({ bodyweight: [{ date: today(), kg }, ...s.bodyweight] })),

      importData: (json) => {
        try {
          const d = json as {
            workouts?: unknown
            bodyweight?: unknown
            customExercises?: unknown
            exercises?: unknown
            plans?: unknown
            generatedPlans?: unknown
          }
          if (!Array.isArray(d.workouts)) return false
          const customs = Array.isArray(d.customExercises)
            ? (d.customExercises as Exercise[])
            : Array.isArray(d.exercises)
              ? (d.exercises as Exercise[])
              : undefined
          if (customs) {
            const merged = [...generatedExercises, ...customs]
            populateByIdCache(merged)
          }
          set({
            workouts: d.workouts as Workout[],
            ...(customs ? { customExercises: customs } : {}),
            ...(Array.isArray(d.bodyweight) ? { bodyweight: d.bodyweight as BodyweightEntry[] } : {}),
            ...(Array.isArray(d.plans) ? { plans: d.plans as WeeklyPlan[] } : {}),
            ...(Array.isArray(d.generatedPlans) ? { generatedPlans: d.generatedPlans as GeneratedPlan[] } : {}),
          })
          return true
        } catch {
          return false
        }
      },

      createPlan: (name) => {
        const id = `plan-${Date.now()}`
        const plan: WeeklyPlan = {
          id,
          name: name.trim() || 'My Plan',
          days: createEmptyDays(),
          createdAt: new Date().toISOString(),
        }
        set((s) => ({ plans: [...s.plans, plan] }))
        return id
      },

      renamePlan: (id, name) =>
        set((s) => ({
          plans: s.plans.map((p) => (p.id === id ? { ...p, name: name.trim() || p.name } : p)),
        })),

      deletePlan: (id) => set((s) => ({ plans: s.plans.filter((p) => p.id !== id) })),

      addExerciseToDay: (planId, day, exerciseId) =>
        set((s) => ({
          plans: s.plans.map((p) => {
            if (p.id !== planId) return p
            return {
              ...p,
              days: p.days.map((d) => {
                if (d.day !== day) return d
                if (d.exercises.some((e) => e.exerciseId === exerciseId)) return d
                const next: PlannedExercise = { exerciseId, progression: 'none' }
                return { ...d, exercises: [...d.exercises, next] }
              }),
            }
          }),
        })),

      removeExerciseFromDay: (planId, day, exerciseId) =>
        set((s) => ({
          plans: s.plans.map((p) => {
            if (p.id !== planId) return p
            return {
              ...p,
              days: p.days.map((d) =>
                d.day !== day ? d : { ...d, exercises: d.exercises.filter((e) => e.exerciseId !== exerciseId) },
              ),
            }
          }),
        })),

      updateExerciseProgression: (planId, day, exerciseId, rule) =>
        set((s) => ({
          plans: s.plans.map((p) => {
            if (p.id !== planId) return p
            return {
              ...p,
              days: p.days.map((d) => {
                if (d.day !== day) return d
                return {
                  ...d,
                  exercises: d.exercises.map((e) => (e.exerciseId === exerciseId ? { ...e, progression: rule } : e)),
                }
              }),
            }
          }),
        })),

      createGeneratedPlan: (input, requested) => {
        const plan = generatePlan(input, requested)
        set((s) => ({ generatedPlans: [plan, ...s.generatedPlans] }))
        return plan.id
      },

      deleteGeneratedPlan: (id) => set((s) => ({ generatedPlans: s.generatedPlans.filter((p) => p.id !== id) })),

      saveGeneratedAsPlan: (generatedId) => {
        const state = get()
        const gen = state.generatedPlans.find((g) => g.id === generatedId)
        if (!gen) return null
        const newPlan: WeeklyPlan = {
          ...gen.weeklyTemplate,
          id: `plan-${Date.now()}`,
          name: gen.weeklyTemplate.name,
        }
        set((s) => ({ plans: [newPlan, ...s.plans] }))
        return newPlan.id
      },
    }),
    {
      name: 'gynproxd-v2',
      partialize: (s) => ({
        customExercises: s.customExercises,
        workouts: s.workouts,
        bodyweight: s.bodyweight,
        activeWorkout: s.activeWorkout,
        plans: s.plans,
        generatedPlans: s.generatedPlans,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          populateByIdCache([...generatedExercises, ...state.customExercises])
        } else {
          populateByIdCache(generatedExercises)
        }
      },
      merge: (persisted, current) => {
        const p = persisted as Partial<GymState> | undefined
        const merged: GymState = {
          ...current,
          ...p,
          customExercises: p?.customExercises ?? current.customExercises,
          workouts: p?.workouts ?? current.workouts,
          bodyweight: p?.bodyweight ?? current.bodyweight,
          activeWorkout: p?.activeWorkout ?? current.activeWorkout,
          plans: (p?.plans as WeeklyPlan[] | undefined) ?? current.plans,
          generatedPlans: (p?.generatedPlans as GeneratedPlan[] | undefined) ?? current.generatedPlans,
        }
        populateByIdCache([...generatedExercises, ...merged.customExercises])
        return merged
      },
    },
  ),
)
