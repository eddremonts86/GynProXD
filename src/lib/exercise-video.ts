import videos from '../data/exercise-videos.json'

/**
 * Demonstration videos, as YouTube ids and nothing else.
 *
 * Only the id is stored, on purpose. YouTube's developer policy caps storage of
 * unauthorised metadata — titles, channel names, thumbnails — at 30 days, and a
 * committed dataset is forever. The embedded player renders the title and the
 * channel itself, so there is nothing to cache and nothing to go stale.
 *
 * Coverage is thin and honest: 26 of the catalogue at the time of writing.
 * There is no free dataset mapping a library this size to demonstration video,
 * so the map is curated — `scripts/import-exercises.mjs` seeds it from
 * exercemus and wger, verifies every id still plays and still allows embedding,
 * and `--youtube` proposes more for a human to approve.
 */
const map = videos as Record<string, string>

/** Null for the large majority of movements. Callers must render without one. */
export function exerciseVideoId(exerciseId: string): string | null {
  return map[exerciseId] ?? null
}

/**
 * The no-cookie host, which is the same player without the tracking cookies on
 * a viewer who never signs in. `rel=0` keeps the end screen inside the same
 * channel rather than recommending its way out of a training app.
 */
export function youtubeEmbedUrl(videoId: string): string {
  return `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1`
}

export function youtubeWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`
}
