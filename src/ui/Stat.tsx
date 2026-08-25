import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface StatProps {
  label: string
  value: ReactNode
  unit?: string
  hint?: string
  /** A SparkArea, rendered under the figure. */
  spark?: ReactNode
  className?: string
}

/** A single measured number on a floating tile. */
export function Stat({ label, value, unit, hint, spark, className }: StatProps) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <span className="text-2xs font-medium text-ink-3">{label}</span>
      <span className="flex items-baseline gap-1">
        <span className="num text-2xl leading-none font-semibold text-ink">{value}</span>
        {unit && <span className="text-xs text-ink-3">{unit}</span>}
      </span>
      {hint && <span className="text-2xs text-ink-3">{hint}</span>}
      {spark}
    </div>
  )
}
