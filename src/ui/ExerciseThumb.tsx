import { useState } from 'react'
import { exerciseImageCandidates } from '@/lib/images'
import { MUSCLE_SHORT } from '@/lib/labels'
import { cn } from '@/lib/utils'
import type { Exercise } from '@/lib/types'

type ThumbSize = 'sm' | 'md' | 'lg' | 'fill'

interface ExerciseThumbProps {
  exercise: Pick<Exercise, 'id' | 'name' | 'muscle' | 'equipment' | 'image'>
  size?: ThumbSize
  className?: string
}

const frameSize: Record<ThumbSize, string> = {
  sm: 'size-9 rounded-sm',
  md: 'size-14 rounded-md',
  lg: 'size-20 rounded-md',
  fill: 'aspect-square w-full rounded-md',
}

const codeSize: Record<ThumbSize, string> = {
  sm: 'text-[9px]',
  md: 'text-[11px]',
  lg: 'text-sm',
  fill: 'text-lg',
}

const pixelSize: Record<ThumbSize, number | undefined> = {
  sm: 36,
  md: 56,
  lg: 80,
  fill: undefined,
}

export function ExerciseThumb({ exercise, size = 'md', className }: ExerciseThumbProps) {
  /* Tracked with the id so switching movement restarts the cascade in render
     rather than in an effect. */
  const [attempt, setAttempt] = useState({ id: exercise.id, index: 0 })
  const index = attempt.id === exercise.id ? attempt.index : 0

  const candidates = exerciseImageCandidates(exercise)
  const src = candidates[index]

  const frame = cn(
    'shrink-0 overflow-hidden border border-line bg-surface-2',
    frameSize[size],
    className,
  )

  if (!src) {
    return (
      <span className={cn(frame, 'flex items-center justify-center')} aria-hidden="true">
        <span className={cn('num font-semibold tracking-widest text-ink-3', codeSize[size])}>
          {MUSCLE_SHORT[exercise.muscle]}
        </span>
      </span>
    )
  }

  /* The muscle code sits under the photo, so the frame is branded from the
     first paint and the CDN's arrival simply covers it. */
  return (
    <span className={cn(frame, 'relative')}>
      <span
        aria-hidden="true"
        className={cn(
          'num absolute inset-0 flex items-center justify-center font-semibold tracking-widest text-ink-3',
          codeSize[size],
        )}
      >
        {MUSCLE_SHORT[exercise.muscle]}
      </span>
      <img
        src={src}
        alt={`${exercise.name}, ${exercise.muscle} with ${exercise.equipment}`}
        loading="lazy"
        decoding="async"
        width={pixelSize[size]}
        height={pixelSize[size]}
        onError={() => setAttempt({ id: exercise.id, index: index + 1 })}
        className="absolute inset-0 h-full w-full object-cover"
      />
    </span>
  )
}
