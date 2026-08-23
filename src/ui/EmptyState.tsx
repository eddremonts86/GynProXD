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
      {icon ? (
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-2 text-muted border border-line">
          {icon}
        </div>
      ) : (
        <div className="h-12 w-12 rounded-full bg-gradient-to-br from-accent/20 to-accent/5 border border-accent/10 flex items-center justify-center">
          <span className="h-2 w-2 rounded-full bg-accent/60" />
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <p className="font-display text-lg font-normal text-ink tracking-tight">{title}</p>
        {description && <p className="max-w-[30ch] text-sm leading-5 text-muted">{description}</p>}
      </div>
      {action && <div className="pt-3">{action}</div>}
    </Card>
  )
}
