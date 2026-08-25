import type { ReactNode } from 'react'

interface PageHeaderProps {
  title: string
  description?: string
  action?: ReactNode
}

export function PageHeader({ title, description, action }: PageHeaderProps) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
      <div className="flex min-w-0 flex-col gap-1.5">
        <h1 className="text-3xl text-ink">{title}</h1>
        {description && <p className="max-w-[58ch] text-sm text-ink-3">{description}</p>}
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </header>
  )
}

interface SectionProps {
  title: string
  hint?: string
  action?: ReactNode
  children: ReactNode
}

/** Section heading with a hairline rule. No eyebrows anywhere in this app. */
export function Section({ title, hint, action, children }: SectionProps) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-end justify-between gap-3 border-b border-line pb-2">
        <div className="flex min-w-0 items-baseline gap-2">
          <h2 className="truncate text-lg text-ink">{title}</h2>
          {hint && <span className="num shrink-0 text-2xs text-ink-3">{hint}</span>}
        </div>
        {action && <div className="flex shrink-0 items-center gap-1.5">{action}</div>}
      </div>
      {children}
    </section>
  )
}
