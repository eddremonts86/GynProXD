import type { ReactNode } from 'react'

interface CardProps {
  children: ReactNode
  className?: string
  hover?: boolean
  padding?: 'none' | 'sm' | 'md' | 'lg'
  onClick?: () => void
  role?: string
  tabIndex?: number
  onKeyDown?: (ev: React.KeyboardEvent) => void
  'aria-label'?: string
}

const paddingMap = {
  none: '',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-5',
} as const

export function Card({
  children,
  className = '',
  hover = false,
  padding = 'md',
  onClick,
  role,
  tabIndex,
  onKeyDown,
  'aria-label': ariaLabel,
}: CardProps) {
  return (
    <div
      className={[
        'rounded-[var(--radius-lg)] border border-line bg-card shadow-[var(--shadow-card)]',
        'backdrop-blur-[1px]',
        paddingMap[padding],
        hover ? 'transition-colors hover:border-line-strong hover:bg-card-hover' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      onClick={onClick}
      role={role}
      tabIndex={tabIndex}
      onKeyDown={onKeyDown}
      aria-label={ariaLabel}
    >
      {children}
    </div>
  )
}
