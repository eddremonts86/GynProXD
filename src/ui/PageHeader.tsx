import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface PageHeaderProps {
  title: string
  description?: string
  /** A count or status beside the title. Same vocabulary as `Section`. */
  hint?: string
  action?: ReactNode
}

export function PageHeader({ title, description, hint, action }: PageHeaderProps) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
      <div className="flex min-w-0 flex-col gap-1.5">
        <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-3xl text-ink">{title}</h1>
          {hint && <span className="num text-2xs text-ink-3">{hint}</span>}
        </span>
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
        {/* The hint gives up its width first. It used to be the other way
            round — the hint was `shrink-0` and the heading truncated — so a
            long one reduced "Week 9" to "W…" while spelling out the block
            beside it. The heading names what you are looking at; the hint is
            the gloss. The heading is capped at the row's own width so a long
            one still truncates rather than spilling, and a shrink weight was
            not enough: it left the heading a fraction of a pixel short of its
            text, which is all an ellipsis needs to appear.

            It wraps rather than truncating. In a narrow column beside an
            action — "Movement of the day" next to "Surprise me" — there is no
            width at which the whole heading fits on one line, and truncating
            it to "Movement of the d…" throws the name away to save a line
            break. `shrink-0` keeps the earlier fix: the heading still takes
            what it needs before the hint gives up any, and only wraps once it
            alone is wider than the row. */}
        <div className="flex min-w-0 items-baseline gap-2">
          <h2 className="max-w-full shrink-0 text-lg leading-snug text-balance break-words text-ink">
            {title}
          </h2>
          {hint && <span className="num min-w-0 truncate text-2xs text-ink-3">{hint}</span>}
        </div>
        {action && <div className="flex shrink-0 items-center gap-1.5">{action}</div>}
      </div>
      {children}
    </section>
  )
}
