import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface DotNumberProps {
  value: ReactNode
  unit?: string
  size?: 'md' | 'lg' | 'xl'
  className?: string
  unitClassName?: string
}

const sizeMap = {
  md: 'text-3xl',
  lg: 'text-5xl',
  xl: 'text-6xl',
} as const

/**
 * A hero figure in the dot-matrix face (Doto). This is the page's signature
 * display treatment: reserved for the one number a tile exists to show, never
 * for tabular data, which stays in Geist Mono via `.num`.
 */
export function DotNumber({ value, unit, size = 'lg', className, unitClassName }: DotNumberProps) {
  return (
    <span className={cn('flex items-baseline gap-1.5', className)}>
      <span className={cn('num-dot leading-none', sizeMap[size])}>{value}</span>
      {unit && <span className={cn('text-sm font-medium opacity-80', unitClassName)}>{unit}</span>}
    </span>
  )
}
