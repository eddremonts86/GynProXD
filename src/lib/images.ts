import fullMap from '../data/images-generated.json'
import repdbMap from '../data/repdb-images.json'

const map = fullMap as Record<string, string>
const repdb = repdbMap as Record<string, string>

export function getExerciseImage(exerciseId: string, fallback?: string | null): string | null {
  if (map[exerciseId]) return map[exerciseId]
  if (fallback) return fallback
  return null
}

export function hasRepdbImage(exerciseId: string): boolean {
  return !!repdb[exerciseId]
}

export const REPDB_COUNT = Object.keys(repdb).length
export const GENERATED_COUNT = 489
export const TOTAL_MAPPED = Object.keys(map).length
