import type { ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { ArrowRight, type Icon } from '@phosphor-icons/react'
import { Wordmark } from '@/components/brand'
import { ThemeToggle } from '@/components/theme-toggle'
import { RailToggle } from '@/components/rail-toggle'
import { useRailHidden } from '@/hooks/use-rail'
import { Button } from '@/ui/Button'
import { Tag } from '@/ui/Tag'
import { cn } from '@/lib/utils'

/**
 * The rhythm both front doors keep.
 *
 * There are two landings now — one for somebody who wants to train and one for
 * a gym that wants to reach them — and you can walk between them. Two copies of
 * this measure, this heading scale and this rail would look identical on the day
 * they were written and drift by the second change; and the drift would show,
 * because the whole point is that the two pages are the same building seen from
 * different doors.
 *
 * Only the shape lives here. Every word stays in the page that says it.
 */

export const GUTTER = 'px-4 sm:px-6 md:px-8 lg:px-10'
export const SHELL = `mx-auto w-full max-w-[90rem] ${GUTTER}`
export const READ = `mx-auto w-full max-w-[82rem] ${GUTTER}`

/** A section that rises into place once, and not at all under reduced motion. */
export function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode
  className?: string
  delay?: number
}) {
  const reduceMotion = useReducedMotion()
  if (reduceMotion) return <div className={className}>{children}</div>
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.5, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  )
}

export function SectionHeading({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <h2
      className={cn(
        'max-w-[17ch] text-3xl leading-[1.08] tracking-tight text-ink md:text-4xl',
        className,
      )}
    >
      {children}
    </h2>
  )
}

export function Lead({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn('max-w-[46ch] text-xl leading-[1.6] text-ink-2', className)}>{children}</p>
  )
}

/** Supporting copy inside cards and index rows. */
export function Body({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn('max-w-[40ch] text-base leading-relaxed text-ink-3', className)}>{children}</p>
  )
}

/** A quiet label above or beside a figure. */
export function Label({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn('text-xs text-ink-3', className)}>{children}</span>
}

export interface LandingSection {
  id: string
  label: string
  icon: Icon
}

/**
 * The way to the other front door.
 *
 * `short` is given rather than derived. The first version took the last word of
 * the label for the narrow bar, which turned "I run a gym" into a link that
 * said "gym" — a stray noun where a destination should be. A label that has to
 * survive being cut is a label somebody should write twice.
 */
export interface CrossLink {
  label: string
  short: string
  href: string
}

/**
 * The section index, and the way to the other door.
 *
 * `cta` is a jump on a wide screen rather than a conversion: the panel it
 * scrolls to is already on the page. The one solid button on either landing is
 * that panel's own submit.
 */
export function LandingRail({
  sections,
  active,
  onJump,
  cta,
  note,
  crossLink,
}: {
  sections: readonly LandingSection[]
  active: string
  onJump: (id: string) => void
  cta: { label: string; target: string; icon?: ReactNode }
  note: string
  crossLink: CrossLink
}) {
  if (useRailHidden()) return null
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col lg:flex">
      {/* Where the rail ends and the content begins. */}
      <span
        aria-hidden="true"
        className="rail-edge pointer-events-none absolute inset-y-0 right-0 w-px opacity-70"
      />

      <div className="flex items-center gap-2 px-5 py-5">
        <button type="button" onClick={() => onJump('top')} aria-label="enForma, back to the top">
          <Wordmark />
        </button>
        <Tag tone="outline">Beta</Tag>
        <RailToggle />
      </div>

      <nav aria-label="Page sections" className="flex flex-1 flex-col gap-0.5 px-3">
        {sections.map((item) => {
          const isCurrent = active === item.id
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onJump(item.id)}
              aria-current={isCurrent ? 'true' : undefined}
              className={cn(
                'flex h-11 items-center gap-2.5 rounded-full px-4 text-sm font-medium',
                'transition-colors duration-150',
                isCurrent
                  ? 'bg-brand text-brand-ink shadow-[var(--shadow-panel)]'
                  : 'text-ink-3 hover:bg-surface hover:text-ink',
              )}
            >
              <item.icon size={18} weight={isCurrent ? 'fill' : 'regular'} />
              <span className="flex-1 text-left">{item.label}</span>
            </button>
          )
        })}
      </nav>

      <div className="flex flex-col gap-2 p-3">
        <Button variant="secondary" onClick={() => onJump(cta.target)} className="w-full">
          {cta.label}
          {cta.icon}
        </Button>

        {/* The other door: a destination, so it is shaped like the section rows
            above it rather than a bare underline. It used to be one, floating
            between a solid button and a line of metadata with equal gaps on
            both sides, so it grouped with neither — and its text sat at the
            rail's 28px while the note below sat at 12, which is what made the
            whole corner look crooked. The arrow waits for a pointer: it is a
            second choice, not a second call to action. */}
        <a
          href={crossLink.href}
          className="group flex h-10 items-center justify-between gap-2 rounded-full px-4 text-sm font-medium text-ink-3 transition-colors duration-150 hover:bg-surface hover:text-ink"
        >
          {crossLink.label}
          <ArrowRight
            size={14}
            weight="bold"
            className="shrink-0 opacity-0 transition-opacity duration-150 group-hover:opacity-100"
          />
        </a>

        {/* Metadata, and it says so by sitting under a rule. */}
        <div className="mt-1 flex items-center justify-between gap-2 border-t border-line px-4 pt-3">
          <Label>{note}</Label>
          <ThemeToggle />
        </div>
      </div>
    </aside>
  )
}

export function MobileBar({
  onJump,
  cta,
  crossLink,
}: {
  onJump: (id: string) => void
  cta: { label: string; target: string }
  crossLink: CrossLink
}) {
  return (
    <header className="sticky top-0 z-30 bg-bg/85 backdrop-blur-md lg:hidden">
      <div className="flex h-16 items-center justify-between gap-4 px-4 md:px-8">
        <span className="flex min-w-0 items-center gap-2">
          <Wordmark />
          {/* Dropped below `sm`: at 375px the wordmark, this, the other door,
              the theme toggle and the submit collide, and of the five this is
              the one nobody came for. */}
          <Tag tone="outline" className="hidden sm:inline-flex">
            Beta
          </Tag>
        </span>
        <span className="flex items-center gap-1">
          {/* Short here on purpose: at 375px the wordmark, a tag, this and the
              submit do not fit, and the door somebody did not come through is
              the one that gives up its words. It gives up words it was written
              to give up, not whichever ones fall off the end. */}
          <a
            href={crossLink.href}
            aria-label={crossLink.label}
            className="px-2 text-xs whitespace-nowrap text-ink-3 underline-offset-2 hover:text-ink hover:underline"
          >
            {crossLink.short}
          </a>
          <ThemeToggle />
          <Button variant="primary" size="sm" onClick={() => onJump(cta.target)}>
            {cta.label}
          </Button>
        </span>
      </div>
    </header>
  )
}
