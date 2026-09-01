import { useEffect, useState } from 'react'
import { PlayCircle } from '@phosphor-icons/react'
import { exerciseImageCandidates } from '@/lib/images'
import { exerciseVideoId, youtubeEmbedUrl } from '@/lib/exercise-video'
import type { Exercise } from '@/lib/types'

/**
 * A demonstration video, for the minority of movements that have one.
 *
 * Mount it with `key={exercise.id}`: switching movements has to put the player
 * back to its poster, and a remount says that more plainly than resetting state
 * from an effect.
 *
 * It is a facade, not an embed. Until somebody presses play this is the
 * movement's own illustration and a button — no iframe, no request to Google,
 * nothing loaded from a third party. That matters twice over here: the app's
 * promise is that your training stays on your device, and YouTube's own
 * developer policy asks that the player not collect data before the viewer has
 * chosen to watch. Pressing play is that choice, and only then does the
 * no-cookie player mount.
 *
 * The video is always additive. The illustrations remain the primary teaching
 * material because they are the half that works on a gym floor with no signal,
 * which is most of them.
 */
export function MovementVideo({ exercise }: { exercise: Exercise }) {
  const videoId = exerciseVideoId(exercise.id)
  const [playing, setPlaying] = useState(false)
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine))

  useEffect(() => {
    const sync = () => setOnline(navigator.onLine)
    window.addEventListener('online', sync)
    window.addEventListener('offline', sync)
    return () => {
      window.removeEventListener('online', sync)
      window.removeEventListener('offline', sync)
    }
  }, [])

  if (!videoId) return null

  if (playing) {
    return (
      <div className="aspect-video w-full overflow-hidden rounded-md border border-line bg-black">
        <iframe
          src={youtubeEmbedUrl(videoId)}
          title={`${exercise.name} demonstration on YouTube`}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="h-full w-full border-0"
        />
      </div>
    )
  }

  const poster = exerciseImageCandidates(exercise)[0]

  return (
    <button
      type="button"
      onClick={() => setPlaying(true)}
      disabled={!online}
      className="group relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-md border border-line bg-surface-2 disabled:cursor-not-allowed"
    >
      {poster && (
        <img
          src={poster}
          alt=""
          aria-hidden="true"
          loading="lazy"
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover opacity-45"
        />
      )}
      <span className="relative flex flex-col items-center gap-1.5">
        <PlayCircle
          weight="fill"
          className="size-11 text-ink transition-transform duration-150 group-hover:scale-105 group-disabled:opacity-40"
        />
        <span className="text-2xs font-medium text-ink-2">
          {online ? 'Watch on YouTube' : 'Video needs a connection'}
        </span>
      </span>
    </button>
  )
}
