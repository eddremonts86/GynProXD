import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

type Tone = 'neutral' | 'brand' | 'good' | 'danger' | 'outline'

interface TagProps {
  children: ReactNode
  tone?: Tone
  className?: string
}

const toneMap: Record<Tone, string> = {
  neutral: 'bg-surface-2 text-ink-3',
  brand: 'bg-brand text-brand-ink',
  good: 'bg-good-soft text-good',
  danger: 'bg-danger-soft text-danger',
  outline: 'border border-line text-ink-3',
}

/** Small factual chip: muscle group, equipment, progression rule. Never decorative. */
export function Tag({ children, tone = 'neutral', className }: TagProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-2xs leading-4 font-medium',
        toneMap[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}
