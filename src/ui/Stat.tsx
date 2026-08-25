import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface StatProps {
  label: string
  value: ReactNode
  unit?: string
  hint?: string
  tone?: 'ink' | 'brand'
  className?: string
}

/** A single measured number. The point of the whole app, so it gets the size. */
export function Stat({ label, value, unit, hint, tone = 'ink', className }: StatProps) {
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <span className="text-2xs font-medium text-ink-3">{label}</span>
      <span className="flex items-baseline gap-1">
        <span
          className={cn(
            'num text-2xl leading-none font-semibold',
            tone === 'brand' ? 'text-brand' : 'text-ink',
          )}
        >
          {value}
        </span>
        {unit && <span className="text-xs text-ink-3">{unit}</span>}
      </span>
      {hint && <span className="text-2xs text-ink-3">{hint}</span>}
    </div>
  )
}
