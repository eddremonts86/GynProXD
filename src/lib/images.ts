import repdbMap from '../data/images-generated.json'
import type { Exercise } from './types'

const illustrations = repdbMap as Record<string, string>

/**
 * The dataset stores absolute jsdelivr URLs, but privacy blockers routinely
 * eat `cdn.jsdelivr.net`, leaving movements with no bundled illustration
 * imageless. Serving the same files from the app's own origin (a `/exercise-img`
 * proxy in nginx / the dev server) sidesteps the blocklists entirely and keeps
 * the service worker able to cache them for offline use.
 */
const JSDELIVR_PREFIX = 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/'
const SAME_ORIGIN_PREFIX = '/exercise-img/'

export function sameOriginImage(url: string): string {
  return url.startsWith(JSDELIVR_PREFIX)
    ? SAME_ORIGIN_PREFIX + url.slice(JSDELIVR_PREFIX.length)
    : url
}

/**
 * Photographs come first: they show a real body doing the movement, and the
 * dataset covers every exercise so the catalogue reads as one consistent set.
 * The bundled RepDB illustrations stay as an offline fallback for when the
 * photo proxy is unreachable, and a typographic tile covers the rest.
 */
export function exerciseImageCandidates(
  exercise: Pick<Exercise, 'id' | 'image'>,
): string[] {
  const candidates: string[] = []
  if (exercise.image) candidates.push(sameOriginImage(exercise.image))
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
  return {
    start: sameOriginImage(start),
    end: sameOriginImage(`${start.slice(0, -'/0.jpg'.length)}/1.jpg`),
  }
}

export function exerciseIllustration(exerciseId: string): string | null {
  return illustrations[exerciseId] ?? null
}
