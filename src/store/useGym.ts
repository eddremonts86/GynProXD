import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { BodyweightEntry, Exercise, Workout } from '../lib/types'
import { generatedExercises } from '../data/exercises-generated'
import { populateByIdCache } from '../lib/exercises'

interface GymState {
  customExercises: Exercise[]
  workouts: Workout[]
  bodyweight: BodyweightEntry[]
  activeWorkout: Workout | null
  addExercise: (e: Exercise) => void
  startWorkout: () => void
  discardWorkout: () => void
  addSet: (exerciseId: string, weight: number, reps: number) => void
  finishWorkout: () => void
  logBodyweight: (kg: number) => void
  importData: (json: unknown) => boolean
}

const today = () => new Date().toISOString().slice(0, 10)

populateByIdCache(generatedExercises)

export const useGym = create<GymState>()(
  persist(
    (set) => ({
      customExercises: [],
      workouts: [],
      bodyweight: [],
      activeWorkout: null,

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
          })
          return true
        } catch {
          return false
        }
      },
    }),
    {
      name: 'gynproxd-v2',
      partialize: (s) => ({
        customExercises: s.customExercises,
        workouts: s.workouts,
        bodyweight: s.bodyweight,
        activeWorkout: s.activeWorkout,
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
        }
        populateByIdCache([...generatedExercises, ...merged.customExercises])
        return merged
      },
    },
  ),
)
