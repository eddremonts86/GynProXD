import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

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

/**
 * The quiet action that sits on a section's rule. Deliberately text-sized: a
 * real button out-measures the heading, and in a row of sections that drops
 * one card below its neighbours. Keep section actions to this.
 */
export const SECTION_ACTION =
  'inline-flex items-center gap-1.5 text-2xs font-medium text-brand underline-offset-2 hover:underline'

interface SectionProps {
  title: string
  hint?: string
  action?: ReactNode
  children: ReactNode
  /** For a section sharing a grid row, where it has to stretch to match. */
  className?: string
}

/** Section heading with a hairline rule. No eyebrows anywhere in this app. */
export function Section({ title, hint, action, children, className }: SectionProps) {
  return (
    <section className={cn('flex flex-col gap-3', className)}>
      <div className="flex min-h-[2.125rem] items-end justify-between gap-3 border-b border-line pb-2">
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
