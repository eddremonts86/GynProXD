import { exerciseById } from './exercises'
import type { MuscleGroup, Workout } from './types'
import { toLocalIso } from './dates'

const MUSCLES: MuscleGroup[] = ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'quads', 'hamstrings', 'glutes', 'calves', 'core', 'other']

export function muscleVolume(workouts: Workout[], weeks = 4): Record<MuscleGroup, number> {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - weeks * 7)
  const cutoffStr = toLocalIso(cutoff)
  const vol: Record<string, number> = {}
  for (const m of MUSCLES) vol[m] = 0
  for (const w of workouts) {
    if (w.date < cutoffStr) continue
    for (const le of w.exercises) {
      const ex = exerciseById(le.exerciseId)
      const muscle = (ex?.muscle ?? 'other') as MuscleGroup
      let setsVol = 0
      for (const s of le.sets) setsVol += s.reps * (s.weight || 1)
      vol[muscle] = (vol[muscle] ?? 0) + setsVol
    }
  }
  return vol as Record<MuscleGroup, number>
}

export function muscleMaxVolume(vol: Record<MuscleGroup, number>): number {
  return Math.max(1, ...Object.values(vol))
}
