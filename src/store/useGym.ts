import { create } from 'zustand'
import type {
  BodyweightEntry,
  DayOfWeek,
  Exercise,
  GeneratedPlan,
  Intensity,
  PlannedExercise,
  ProfileDetails,
  ProgressionRule,
  WeeklyPlan,
  Workout,
} from '../lib/types'
import { exerciseById, populateByIdCache } from '../lib/exercise-cache'
import { INTENSITY_SETS } from '../lib/intensity'
import { todayIso } from '../lib/dates'
import { withRecordIds } from '../lib/records'
import type { ActiveChallenge, Challenge } from '../lib/challenge'
import type { FitnessTestResult } from '../lib/fitness-test'
import type { StoryProgress, TrackId } from '../lib/story'

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
  startWorkoutFromPlan: (planId: string, day: DayOfWeek, intensity?: Intensity) => void
  setSessionIntensity: (intensity: Intensity) => void
  discardWorkout: () => void
  addSet: (exerciseId: string, weight: number, reps: number, opts?: { durationSec?: number; side?: 'L' | 'R' }) => void
  removeSet: (exerciseId: string, index: number) => void
  addExerciseToSession: (exerciseId: string) => void
  removeExerciseFromSession: (exerciseId: string) => void
  finishWorkout: (opts?: { ec?: boolean }) => void
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
  challenges: ActiveChallenge[]
  fitnessTest: FitnessTestResult | null
  setFitnessTest: (result: FitnessTestResult | null) => void
  story: StoryProgress | null
  startStory: (programId: string) => void
  leaveStory: () => void
  chooseStoryTrack: (track: TrackId) => void
  toggleStoryDay: (day: number) => void
  startWorkoutFromExercises: (exerciseIds: string[], intensity?: Intensity) => void
  startChallenge: (challenge: Challenge) => void
  abandonChallenge: (challengeId: string) => void
  toggleChallengeDay: (challengeId: string, dateIso: string) => void
}

const today = todayIso

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
      challenges: [],
      fitnessTest: null,
      story: null,

      setFitnessTest: (result) => set({ fitnessTest: result }),

      /* One story at a time: two parallel narratives would be two streaks
         competing, which is how both get abandoned. */
      startStory: (programId) =>
        set({ story: { programId, startedAt: today(), completedDays: [] } }),

      leaveStory: () => set({ story: null }),

      chooseStoryTrack: (track) =>
        set((s) => (s.story ? { story: { ...s.story, track } } : s)),

      toggleStoryDay: (day) =>
        set((s) => {
          if (!s.story) return s
          const completedDays = s.story.completedDays.includes(day)
            ? s.story.completedDays.filter((d) => d !== day)
            : [...s.story.completedDays, day]
          return { story: { ...s.story, completedDays } }
        }),

      /* Start a session from an arbitrary movement list — a story day owns
         its movements rather than living in a weekly plan. */
      startWorkoutFromExercises: (exerciseIds, intensity) =>
        set({
          activeWorkout: {
            id: crypto.randomUUID(),
            date: today(),
            startedAt: new Date().toISOString(),
            intensity,
            exercises: exerciseIds.map((exerciseId) => ({
              exerciseId,
              sets: [],
              targetSets: intensity ? INTENSITY_SETS[intensity] : undefined,
            })),
          },
        }),

      /* Day one is the day you join. The definition is copied in, so a
         gym-published challenge keeps working if its message is deleted. */
      startChallenge: (challenge) =>
        set((s) => {
          if (s.challenges.some((c) => c.challenge.id === challenge.id)) return s
          return {
            challenges: [
              { challenge: structuredClone(challenge), startedAt: today(), completedDays: [] },
              ...s.challenges,
            ],
          }
        }),

      abandonChallenge: (challengeId) =>
        set((s) => ({
          challenges: s.challenges.filter((c) => c.challenge.id !== challengeId),
        })),

      toggleChallengeDay: (challengeId, dateIso) =>
        set((s) => ({
          challenges: s.challenges.map((c) => {
            if (c.challenge.id !== challengeId) return c
            const completedDays = c.completedDays.includes(dateIso)
              ? c.completedDays.filter((d) => d !== dateIso)
              : [...c.completedDays, dateIso]
            return { ...c, completedDays }
          }),
        })),

      addExercise: (e) =>
        set((s) => {
          if (exerciseById(e.id)) return s
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

      startWorkoutFromPlan: (planId, day, intensity = 'II') =>
        set((s) => {
          const plan = s.plans.find((p) => p.id === planId)
          const planned = plan?.days.find((d) => d.day === day)
          const exercises = (planned?.exercises ?? []).map((pe) => ({
            exerciseId: pe.exerciseId,
            sets: [] as { weight: number; reps: number; durationSec?: number; side?: 'L' | 'R' }[],
            supersetGroup: pe.supersetGroup ?? undefined,
            targetSets: INTENSITY_SETS[intensity],
          }))
          return {
            activeWorkout: {
              id: crypto.randomUUID(),
              date: today(),
              startedAt: new Date().toISOString(),
              intensity,
              exercises,
            },
          }
        }),

      /* Applies live, mid-session: the dial is a goal, so retargeting is free. */
      setSessionIntensity: (intensity) =>
        set((s) => {
          if (!s.activeWorkout) return s
          return {
            activeWorkout: {
              ...s.activeWorkout,
              intensity,
              exercises: s.activeWorkout.exercises.map((e) => ({
                ...e,
                targetSets: INTENSITY_SETS[intensity],
              })),
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

      /* Undo a logged set. Mis-taps happen mid-session and retyping the whole
         thing to fix one number is worse than the mistake. */
      removeSet: (exerciseId, index) =>
        set((s) => {
          if (!s.activeWorkout) return s
          const w = structuredClone(s.activeWorkout)
          const ex = w.exercises.find((e) => e.exerciseId === exerciseId)
          if (!ex || index < 0 || index >= ex.sets.length) return s
          ex.sets.splice(index, 1)
          return { activeWorkout: w }
        }),

      addExerciseToSession: (exerciseId) =>
        set((s) => {
          if (!s.activeWorkout) return s
          if (s.activeWorkout.exercises.some((e) => e.exerciseId === exerciseId)) return s
          const intensity = s.activeWorkout.intensity
          return {
            activeWorkout: {
              ...s.activeWorkout,
              exercises: [
                ...s.activeWorkout.exercises,
                {
                  exerciseId,
                  sets: [],
                  targetSets: intensity ? INTENSITY_SETS[intensity] : undefined,
                },
              ],
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

      finishWorkout: (opts) =>
        set((s) => {
          if (!s.activeWorkout) return { activeWorkout: null }
          const performed = s.activeWorkout.exercises.filter((e) => e.sets.length > 0)
          if (performed.length === 0) return { activeWorkout: null }
          return {
            workouts: [
              {
                ...s.activeWorkout,
                exercises: performed,
                endedAt: new Date().toISOString(),
                ec: opts?.ec || undefined,
              },
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
          challenges: [],
          fitnessTest: null,
          story: null,
        }),

      setProfileDetails: (details) => set({ profileDetails: details }),

      logBodyweight: (kg) =>
        set((s) => ({
          bodyweight: [{ id: crypto.randomUUID(), date: today(), kg }, ...s.bodyweight],
        })),

      importData: (json) => {
        try {
          const d = json as {
            workouts?: unknown
            bodyweight?: unknown
            customExercises?: unknown
            exercises?: unknown
            plans?: unknown
            generatedPlans?: unknown
            challenges?: unknown
          }
          if (!Array.isArray(d.workouts)) return false
          const customs = Array.isArray(d.customExercises)
            ? (d.customExercises as Exercise[])
            : Array.isArray(d.exercises)
              ? (d.exercises as Exercise[])
              : undefined
          if (customs) {
            populateByIdCache(customs)
          }
          set({
            workouts: d.workouts as Workout[],
            ...(customs ? { customExercises: customs } : {}),
            ...(Array.isArray(d.bodyweight)
              ? { bodyweight: withRecordIds(d.bodyweight as BodyweightEntry[]) }
              : {}),
            ...(Array.isArray(d.plans) ? { plans: d.plans as WeeklyPlan[] } : {}),
            ...(Array.isArray(d.generatedPlans) ? { generatedPlans: d.generatedPlans as GeneratedPlan[] } : {}),
            ...(Array.isArray(d.challenges) ? { challenges: d.challenges as ActiveChallenge[] } : {}),
          })
          return true
        } catch {
          return false
        }
      },

      createPlan: (name) => {
        /* Random rather than clock-based: a row id has to be unique across
           every device, not just within one millisecond on this one. */
        const id = `plan-${crypto.randomUUID()}`
        const plan: WeeklyPlan = {
          id,
          name: name.trim() || 'My Plan',
          days: createEmptyDays(),
          createdAt: new Date().toISOString(),
        }
        /* Newest first, the same order a reload rebuilds from the stored rows. */
        set((s) => ({ plans: [plan, ...s.plans] }))
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
          id: `plan-${crypto.randomUUID()}`,
          createdAt: new Date().toISOString(),
        }
        set((s) => ({ plans: [newPlan, ...s.plans] }))
        return newPlan.id
      },
}))

/** The persisted slice of the store: user data, nothing derived. */
export interface GymSnapshot {
  customExercises: Exercise[]
  workouts: Workout[]
  bodyweight: BodyweightEntry[]
  activeWorkout: Workout | null
  plans: WeeklyPlan[]
  generatedPlans: GeneratedPlan[]
  profileDetails: ProfileDetails | null
  challenges: ActiveChallenge[]
  fitnessTest: FitnessTestResult | null
  story: StoryProgress | null
}

export const EMPTY_SNAPSHOT: GymSnapshot = {
  customExercises: [],
  workouts: [],
  bodyweight: [],
  activeWorkout: null,
  plans: [],
  generatedPlans: [],
  profileDetails: null,
  challenges: [],
  fitnessTest: null,
  story: null,
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
    challenges: state.challenges,
    fitnessTest: state.fitnessTest,
    story: state.story,
  }
}

/** Loads a profile's snapshot into the live store, tolerating older shapes. */
export function hydrateGym(snapshot: Partial<GymSnapshot> | null | undefined): void {
  const next: GymSnapshot = {
    customExercises: snapshot?.customExercises ?? [],
    workouts: snapshot?.workouts ?? [],
    bodyweight: withRecordIds(snapshot?.bodyweight ?? []),
    activeWorkout: snapshot?.activeWorkout ?? null,
    plans: snapshot?.plans ?? [],
    generatedPlans: snapshot?.generatedPlans ?? [],
    profileDetails: snapshot?.profileDetails ?? null,
    challenges: snapshot?.challenges ?? [],
    fitnessTest: snapshot?.fitnessTest ?? null,
    story: snapshot?.story ?? null,
  }
  populateByIdCache(next.customExercises)
  useGym.setState(next)
}
