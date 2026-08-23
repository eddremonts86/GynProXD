import type { ReactNode } from 'react'
import { Card } from './Card'

interface EmptyStateProps {
  title: string
  description?: string
  action?: ReactNode
  icon?: ReactNode
}

export function EmptyState({ title, description, action, icon }: EmptyStateProps) {
  return (
    <Card className="flex flex-col items-center gap-3 py-10 text-center">
      {icon && <div className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-2 text-muted">{icon}</div>}
      <div className="flex flex-col gap-1">
        <p className="text-sm font-semibold text-zinc-100">{title}</p>
        {description && <p className="max-w-[28ch] text-sm leading-5 text-muted">{description}</p>}
      </div>
      {action && <div className="pt-2">{action}</div>}
    </Card>
  )
}
