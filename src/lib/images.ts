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
const REPDB_PREFIX = '/repdb/'

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
 * Both datasets ship a movement as two frames, under their own naming: the
 * photographs pair `0.jpg` with `1.jpg`, the RepDB illustrations pair
 * `-start.webp` with `-peak.webp`. Together they explain the movement in a way
 * a single still cannot. RepDB's holds and stretches ship one `-main.webp`
 * frame instead, and correctly get no pair.
 */
export function exercisePhotoFrames(
  exercise: Pick<Exercise, 'image'>,
): { start: string; end: string } | null {
  const start = exercise.image
  if (!start) return null
  if (start.endsWith('/0.jpg')) {
    return {
      start: sameOriginImage(start),
      end: sameOriginImage(`${start.slice(0, -'/0.jpg'.length)}/1.jpg`),
    }
  }
  if (start.endsWith('-start.webp')) {
    return { start, end: `${start.slice(0, -'-start.webp'.length)}-peak.webp` }
  }
  return null
}

export function exerciseIllustration(exerciseId: string): string | null {
  return illustrations[exerciseId] ?? null
}

/**
 * How well a movement will render, on the three-way scale the library browses in.
 *
 * `0` — our own material: a free-exercise-db photograph or a RepDB
 *   illustration. One visual language across 1,547 movements, which is what
 *   makes a grid of them read as a catalogue.
 * `1` — a picture from wger, uploaded by whoever wrote the movement. Most are
 *   clean line drawings; a minority are logos, video stills or two-panel
 *   composites with their own captions burnt in. Good enough to show, not
 *   consistent enough to lead with.
 * `2` — nothing, and a typographic muscle tile renders instead.
 *
 * Cheaper than `exerciseImageCandidates`, which allocates: this answers what a
 * sort needs without building the cascade.
 */
export function artworkRank(exercise: Pick<Exercise, 'id' | 'image'>): 0 | 1 | 2 {
  if (illustrations[exercise.id]) return 0
  const source = exercise.image
  if (!source) return 2
  const ours =
    source.startsWith(JSDELIVR_PREFIX) ||
    source.startsWith(SAME_ORIGIN_PREFIX) ||
    source.startsWith(REPDB_PREFIX)
  return ours ? 0 : 1
}
