import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface PanelProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
  /**
   * raised: floating card, shadow instead of a border.
   * quiet: hairline only, sits flat on the page.
   * inset: one tonal step down, for areas inside a card.
   */
  tone?: 'raised' | 'quiet' | 'inset'
  padding?: 'none' | 'sm' | 'md' | 'lg'
  interactive?: boolean
}

const toneMap = {
  raised: 'bg-surface shadow-[var(--shadow-panel)]',
  quiet: 'border border-line bg-transparent',
  inset: 'bg-surface-2',
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
        'rounded-xl',
        toneMap[tone],
        paddingMap[padding],
        interactive && 'cursor-pointer transition-shadow duration-150 hover:shadow-[var(--shadow-tile)]',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}
