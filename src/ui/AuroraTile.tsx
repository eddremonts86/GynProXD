import type { ReactNode } from 'react'
import { DotNumber } from './DotNumber'
import { cn } from '@/lib/utils'

interface AuroraTileProps {
  tone: 'green' | 'orange'
  label: string
  /** Omit when there is nothing to measure yet; the sub line takes over. */
  value?: ReactNode
  unit?: string
  sub?: string
  /** Extra content pinned to the bottom of the tile, e.g. a TrendPill. */
  foot?: ReactNode
  className?: string
}

/**
 * The one place colour lives. A floating gradient tile carrying a single
 * dot-matrix hero figure.
 *
 * The type is `--aurora-ink`, which is the app's ink on the light theme and
 * white on the dark one, because neither colour works on both. Measured off the
 * painted pixels of every surface that carries text
 * (`scripts/audit/aurora-contrast.mjs`): the light material runs 1.26:1 against
 * white — unreadable, and not only at the pale corner — while the app's ink
 * clears 4.5:1 on all of it. On the dark theme it is the other way round.
 *
 * This replaces a hairline text-shadow that was there to buy back contrast at
 * the corner. It was treating a corner: the whole light surface was too pale,
 * and a shadow cannot be measured into a passing contrast ratio anyway. With
 * the colours right the shadow has nothing left to do.
 */

export function AuroraTile({ tone, label, value, unit, sub, foot, className }: AuroraTileProps) {
  return (
    <div
      className={cn(
        'flex min-h-44 flex-col justify-between gap-4 rounded-xl p-5 shadow-[var(--shadow-tile)]',
        tone === 'green' ? 'aurora-green' : 'aurora-orange',
        className,
      )}
    >
      <span className="text-sm font-medium text-aurora-ink">{label}</span>
      <div className="flex flex-col gap-1">
        {value !== undefined ? (
          <>
            <DotNumber
              value={value}
              unit={unit}
              size="xl"
              className="text-aurora-ink"
              unitClassName="text-aurora-ink"
            />
            {sub && <span className="text-xs text-aurora-ink">{sub}</span>}
          </>
        ) : (
          <span className="max-w-[24ch] text-lg leading-snug font-medium text-aurora-ink">
            {sub}
          </span>
        )}
      </div>
      {foot && <div className="flex items-center gap-2">{foot}</div>}
    </div>
  )
}
