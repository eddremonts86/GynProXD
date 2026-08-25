import { useState } from 'react'
import { exerciseIllustration, exercisePhotoFrames } from '@/lib/images'
import { cn } from '@/lib/utils'
import type { Exercise } from '@/lib/types'

/**
 * Start and end of the rep side by side. One still cannot show a movement, and
 * the dataset ships both frames for every exercise.
 */
export function MovementFrames({ exercise }: { exercise: Exercise }) {
  const frames = exercisePhotoFrames(exercise)
  const [broken, setBroken] = useState<Record<string, boolean>>({})

  const shots = frames
    ? ([
        { src: frames.start, label: 'Start' },
        { src: frames.end, label: 'End' },
      ] as const)
    : []
  const visible = shots.filter((shot) => !broken[shot.src])

  if (visible.length === 0) {
    const illustration = exerciseIllustration(exercise.id)
    if (!illustration) return null
    return (
      <img
        src={illustration}
        alt={`${exercise.name}, ${exercise.muscle} with ${exercise.equipment}`}
        loading="lazy"
        decoding="async"
        className="h-52 w-full rounded-md border border-line bg-surface-2 object-contain"
      />
    )
  }

  return (
    <div className={cn('grid gap-2', visible.length > 1 ? 'grid-cols-2' : 'grid-cols-1')}>
      {visible.map((shot) => (
        <figure key={shot.src} className="flex flex-col gap-1.5">
          <img
            src={shot.src}
            alt={`${exercise.name}, ${shot.label.toLowerCase()} position`}
            loading="lazy"
            decoding="async"
            onError={() => setBroken((b) => ({ ...b, [shot.src]: true }))}
            className="aspect-[4/3] w-full rounded-md bg-surface object-cover"
          />
          <figcaption className="text-2xs text-ink-3">{shot.label}</figcaption>
        </figure>
      ))}
    </div>
  )
}
