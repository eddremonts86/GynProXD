import repdbMap from '../data/repdb-images.json'

const map = repdbMap as Record<string, string>

export function getExerciseImage(exerciseId: string, fallback?: string | null): string | null {
  if (map[exerciseId]) return map[exerciseId]
  if (fallback) return fallback
  return null
}

export function hasRepdbImage(exerciseId: string): boolean {
  return !!map[exerciseId]
}

export const REPDB_COUNT = Object.keys(map).length
