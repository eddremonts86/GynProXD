import repdbMap from '../data/images-generated.json'
import type { Exercise } from './types'

const illustrations = repdbMap as Record<string, string>

/**
 * Photographs come first: they show a real body doing the movement, and the
 * dataset covers every exercise so the catalogue reads as one consistent set.
 * The bundled RepDB illustrations stay as an offline fallback for when the
 * photo CDN is unreachable, and a typographic tile covers the rest.
 */
export function exerciseImageCandidates(
  exercise: Pick<Exercise, 'id' | 'image'>,
): string[] {
  const candidates: string[] = []
  if (exercise.image) candidates.push(exercise.image)
  const illustration = illustrations[exercise.id]
  if (illustration) candidates.push(illustration)
  return candidates
}

/**
 * Each movement in the dataset ships two frames: `0.jpg` is the start position
 * and `1.jpg` the end of the rep. Together they explain the movement in a way
 * a single still cannot.
 */
export function exercisePhotoFrames(
  exercise: Pick<Exercise, 'image'>,
): { start: string; end: string } | null {
  const start = exercise.image
  if (!start || !start.endsWith('/0.jpg')) return null
  return { start, end: `${start.slice(0, -'/0.jpg'.length)}/1.jpg` }
}

export function exerciseIllustration(exerciseId: string): string | null {
  return illustrations[exerciseId] ?? null
}
