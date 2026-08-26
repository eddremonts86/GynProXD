import { create } from 'zustand'
import type {
  BodyweightEntry,
  DayOfWeek,
  Exercise,
  GeneratedPlan,
  PlannedExercise,
  ProfileDetails,
  ProgressionRule,
  WeeklyPlan,
  Workout,
} from '../lib/types'
import { generatedExercises } from '../data/exercises-generated'
import { populateByIdCache } from '../lib/exercises'
import { todayIso } from '../lib/dates'

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
  profileDetails: ProfileDetails | null
  setProfileDetails: (details: ProfileDetails | null) => void
  addExercise: (e: Exercise) => void
  startWorkout: () => void
  startWorkoutFromPlan: (planId: string, day: DayOfWeek) => void
  discardWorkout: () => void
  addSet: (exerciseId: string, weight: number, reps: number, opts?: { durationSec?: number; side?: 'L' | 'R' }) => void
  addExerciseToSession: (exerciseId: string) => void
  removeExerciseFromSession: (exerciseId: string) => void
  finishWorkout: () => void
  deleteWorkout: (id: string) => void
  clearAllData: () => void
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
  updateExerciseOptions: (
    planId: string,
    day: DayOfWeek,
    exerciseId: string,
    patch: Partial<Pick<PlannedExercise, 'timed' | 'unilateral' | 'supersetGroup'>>,
  ) => void
  setSupersetGroup: (planId: string, day: DayOfWeek, exerciseIds: string[], groupId: string | null) => void
  addGeneratedPlan: (plan: GeneratedPlan) => void
  deleteGeneratedPlan: (id: string) => void
  saveGeneratedAsPlan: (generatedId: string) => string | null
}

const today = todayIso

populateByIdCache(generatedExercises)

/**
 * The store is memory-only. Persistence lives in lib/profiles: each profile's
 * snapshot is encrypted at rest, loaded on unlock and saved on change.
 */
export const useGym = create<GymState>()((set, get) => ({
      customExercises: [],
      workouts: [],
      bodyweight: [],
      activeWorkout: null,
      plans: [],
      generatedPlans: [],
      profileDetails: null,

      addExercise: (e) =>
        set((s) => {
          if (s.customExercises.some((x) => x.id === e.id)) return s
          if (generatedExercises.some((x) => x.id === e.id)) return s
          const next = [...s.customExercises, e]
          populateByIdCache([e])
          return { customExercises: next }
        }),

      startWorkout: () =>
        set({
          activeWorkout: {
            id: crypto.randomUUID(),
            date: today(),
            startedAt: new Date().toISOString(),
            exercises: [],
          },
        }),

      startWorkoutFromPlan: (planId, day) =>
        set((s) => {
          const plan = s.plans.find((p) => p.id === planId)
          const planned = plan?.days.find((d) => d.day === day)
          const exercises = (planned?.exercises ?? []).map((pe) => ({
            exerciseId: pe.exerciseId,
            sets: [] as { weight: number; reps: number; durationSec?: number; side?: 'L' | 'R' }[],
            supersetGroup: pe.supersetGroup ?? undefined,
          }))
          return {
            activeWorkout: {
              id: crypto.randomUUID(),
              date: today(),
              startedAt: new Date().toISOString(),
              exercises,
            },
          }
        }),

      discardWorkout: () => set({ activeWorkout: null }),

      addSet: (exerciseId, weight, reps, opts) =>
        set((s) => {
          if (!s.activeWorkout) return s
          const w = structuredClone(s.activeWorkout)
          let ex = w.exercises.find((e) => e.exerciseId === exerciseId)
          if (!ex) {
            ex = { exerciseId, sets: [] }
            w.exercises.push(ex)
          }
          ex.sets.push({ weight, reps, durationSec: opts?.durationSec, side: opts?.side })
          return { activeWorkout: w }
        }),

      addExerciseToSession: (exerciseId) =>
        set((s) => {
          if (!s.activeWorkout) return s
          if (s.activeWorkout.exercises.some((e) => e.exerciseId === exerciseId)) return s
          return {
            activeWorkout: {
              ...s.activeWorkout,
              exercises: [...s.activeWorkout.exercises, { exerciseId, sets: [] }],
            },
          }
        }),

      removeExerciseFromSession: (exerciseId) =>
        set((s) => {
          if (!s.activeWorkout) return s
          return {
            activeWorkout: {
              ...s.activeWorkout,
              exercises: s.activeWorkout.exercises.filter((e) => e.exerciseId !== exerciseId),
            },
          }
        }),

      finishWorkout: () =>
        set((s) => {
          if (!s.activeWorkout) return { activeWorkout: null }
          const performed = s.activeWorkout.exercises.filter((e) => e.sets.length > 0)
          if (performed.length === 0) return { activeWorkout: null }
          return {
            workouts: [
              { ...s.activeWorkout, exercises: performed, endedAt: new Date().toISOString() },
              ...s.workouts,
            ],
            activeWorkout: null,
          }
        }),

      deleteWorkout: (id) =>
        set((s) => ({ workouts: s.workouts.filter((w) => w.id !== id) })),

      clearAllData: () =>
        set({
          customExercises: [],
          workouts: [],
          bodyweight: [],
          activeWorkout: null,
          plans: [],
          generatedPlans: [],
          profileDetails: null,
        }),

      setProfileDetails: (details) => set({ profileDetails: details }),

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

      updateExerciseOptions: (planId, day, exerciseId, patch) =>
        set((s) => ({
          plans: s.plans.map((p) => {
            if (p.id !== planId) return p
            return {
              ...p,
              days: p.days.map((d) => {
                if (d.day !== day) return d
                return {
                  ...d,
                  exercises: d.exercises.map((e) => (e.exerciseId === exerciseId ? { ...e, ...patch } : e)),
                }
              }),
            }
          }),
        })),

      setSupersetGroup: (planId, day, exerciseIds, groupId) =>
        set((s) => ({
          plans: s.plans.map((p) => {
            if (p.id !== planId) return p
            return {
              ...p,
              days: p.days.map((d) => {
                if (d.day !== day) return d
                return {
                  ...d,
                  exercises: d.exercises.map((e) =>
                    exerciseIds.includes(e.exerciseId) ? { ...e, supersetGroup: groupId } : e,
                  ),
                }
              }),
            }
          }),
        })),

      addGeneratedPlan: (plan) =>
        set((s) => ({ generatedPlans: [plan, ...s.generatedPlans] })),

      deleteGeneratedPlan: (id) => set((s) => ({ generatedPlans: s.generatedPlans.filter((p) => p.id !== id) })),

      saveGeneratedAsPlan: (generatedId) => {
        const state = get()
        const gen = state.generatedPlans.find((g) => g.id === generatedId)
        if (!gen) return null
        /* Deep clone: the copy is yours to edit and must not share structure
           with the programme it came from. */
        const newPlan: WeeklyPlan = {
          ...structuredClone(gen.weeklyTemplate),
          id: `plan-${Date.now()}`,
          createdAt: new Date().toISOString(),
        }
        set((s) => ({ plans: [newPlan, ...s.plans] }))
        return newPlan.id
      },
}))

populateByIdCache(generatedExercises)

/** The persisted slice of the store: user data, nothing derived. */
export interface GymSnapshot {
  customExercises: Exercise[]
  workouts: Workout[]
  bodyweight: BodyweightEntry[]
  activeWorkout: Workout | null
  plans: WeeklyPlan[]
  generatedPlans: GeneratedPlan[]
  profileDetails: ProfileDetails | null
}

export const EMPTY_SNAPSHOT: GymSnapshot = {
  customExercises: [],
  workouts: [],
  bodyweight: [],
  activeWorkout: null,
  plans: [],
  generatedPlans: [],
  profileDetails: null,
}

export function snapshotGym(state: GymState = useGym.getState()): GymSnapshot {
  return {
    customExercises: state.customExercises,
    workouts: state.workouts,
    bodyweight: state.bodyweight,
    activeWorkout: state.activeWorkout,
    plans: state.plans,
    generatedPlans: state.generatedPlans,
    profileDetails: state.profileDetails,
  }
}

/** Loads a profile's snapshot into the live store, tolerating older shapes. */
export function hydrateGym(snapshot: Partial<GymSnapshot> | null | undefined): void {
  const next: GymSnapshot = {
    customExercises: snapshot?.customExercises ?? [],
    workouts: snapshot?.workouts ?? [],
    bodyweight: snapshot?.bodyweight ?? [],
    activeWorkout: snapshot?.activeWorkout ?? null,
    plans: snapshot?.plans ?? [],
    generatedPlans: snapshot?.generatedPlans ?? [],
    profileDetails: snapshot?.profileDetails ?? null,
  }
  populateByIdCache([...generatedExercises, ...next.customExercises])
  useGym.setState(next)
}
