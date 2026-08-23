import type { ReactNode } from 'react'

interface BadgeProps {
  children: ReactNode
  variant?: 'default' | 'accent' | 'muted'
  className?: string
}

const variantMap = {
  default: 'border-line bg-surface-2 text-muted',
  accent: 'border-accent/20 bg-accent-soft text-accent',
  muted: 'border-transparent bg-line text-muted',
} as const

export function Badge({ children, variant = 'default', className = '' }: BadgeProps) {
  return (
    <span
      className={[
        'inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium tracking-widest uppercase leading-none',
        variantMap[variant],
        className,
      ].join(' ')}
    >
      {children}
    </span>
  )
}
