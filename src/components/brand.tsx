import { cn } from '@/lib/utils'

/**
 * Geometric mark: four rules of decreasing length, read as a measuring scale.
 * Forma is an instrument, so the identity is a scale rather than a dumbbell.
 */
export function Mark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex size-8 shrink-0 flex-col justify-center gap-[3px] rounded-md bg-brand px-2',
        className,
      )}
    >
      <span className="h-[2px] w-full rounded-full bg-brand-ink" />
      <span className="h-[2px] w-3/4 rounded-full bg-brand-ink opacity-80" />
      <span className="h-[2px] w-1/2 rounded-full bg-brand-ink opacity-60" />
      <span className="h-[2px] w-1/4 rounded-full bg-brand-ink opacity-40" />
    </span>
  )
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('flex items-center gap-2.5', className)}>
      <Mark />
      <span className="text-lg leading-none font-semibold tracking-tight text-ink">Forma</span>
    </span>
  )
}
