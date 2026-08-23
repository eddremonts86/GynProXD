import type { ReactNode } from 'react'

interface BadgeProps {
  children: ReactNode
  variant?: 'default' | 'accent' | 'muted'
  className?: string
}

const variantMap = {
  default: 'border-line bg-surface-2 text-zinc-300',
  accent: 'border-accent/20 bg-accent-soft text-accent',
  muted: 'border-transparent bg-line text-zinc-500',
} as const

export function Badge({ children, variant = 'default', className = '' }: BadgeProps) {
  return (
    <span
      className={[
        'inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium tracking-wide uppercase leading-none',
        variantMap[variant],
        className,
      ].join(' ')}
    >
      {children}
    </span>
  )
}
