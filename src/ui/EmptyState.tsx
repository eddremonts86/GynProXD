import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface EmptyStateProps {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
  className?: string
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-3 rounded-lg border border-dashed border-line px-6 py-12 text-center',
        className,
      )}
    >
      {icon && (
        <span className="flex size-10 items-center justify-center rounded-full bg-surface-2 text-ink-3">
          {icon}
        </span>
      )}
      <div className="flex flex-col gap-1.5">
        <p className="text-lg text-ink">{title}</p>
        {description && <p className="max-w-[42ch] text-sm text-ink-3">{description}</p>}
      </div>
      {action && <div className="pt-1">{action}</div>}
    </div>
  )
}
