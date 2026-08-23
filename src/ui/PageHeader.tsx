import type { ReactNode } from 'react'

interface PageHeaderProps {
  title: string
  description?: string
  action?: ReactNode
  eyebrow?: string
}

export function PageHeader({ title, description, action, eyebrow }: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex flex-col gap-2">
        {eyebrow && <p className="text-xs font-medium tracking-[0.14em] text-accent uppercase">{eyebrow}</p>}
        <h1 className="font-display text-3xl font-normal tracking-tight text-ink md:text-4xl">{title}</h1>
        {description && <p className="max-w-[52ch] text-sm leading-5 text-muted">{description}</p>}
      </div>
      {action && <div className="shrink-0 pt-1">{action}</div>}
    </div>
  )
}
