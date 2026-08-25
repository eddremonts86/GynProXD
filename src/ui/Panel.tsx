import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface PanelProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
  /** Quiet panels sit directly on the page background with a hairline only. */
  tone?: 'raised' | 'quiet' | 'inset'
  padding?: 'none' | 'sm' | 'md' | 'lg'
  interactive?: boolean
}

const toneMap = {
  raised: 'border border-line bg-surface shadow-[var(--shadow-panel)]',
  quiet: 'border border-line bg-transparent',
  inset: 'border border-line/70 bg-surface-2',
} as const

const paddingMap = {
  none: '',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-5 md:p-6',
} as const

export function Panel({
  children,
  className,
  tone = 'raised',
  padding = 'md',
  interactive = false,
  ...props
}: PanelProps) {
  return (
    <div
      className={cn(
        'rounded-lg',
        toneMap[tone],
        paddingMap[padding],
        interactive &&
          'cursor-pointer transition-colors duration-150 hover:border-line-strong hover:bg-surface-2',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}
