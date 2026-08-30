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
 * White text is verified at 3:1 (large) and 4.5:1 (small) against the
 * gradient's saturated centre — but the label sits in the top-left corner,
 * which is exactly where the soft blob lands, so at the corner alone the
 * material is far too pale to carry white type. A hairline shadow buys back
 * the contrast there without putting a glow on the design: it is invisible
 * over the saturated centre and only does work at the pale edges.
 */
export const OVER_AURORA = '[text-shadow:0_1px_2px_rgb(0_0_0/0.32)]'

export function AuroraTile({ tone, label, value, unit, sub, foot, className }: AuroraTileProps) {
  return (
    <div
      className={cn(
        'flex min-h-44 flex-col justify-between gap-4 rounded-xl p-5 shadow-[var(--shadow-tile)]',
        tone === 'green' ? 'aurora-green' : 'aurora-orange',
        className,
      )}
    >
      <span className={cn('text-sm font-medium text-white', OVER_AURORA)}>{label}</span>
      <div className="flex flex-col gap-1">
        {value !== undefined ? (
          <>
            <DotNumber
              value={value}
              unit={unit}
              size="xl"
              className={OVER_AURORA}
              unitClassName="text-white"
            />
            {sub && <span className={cn('text-xs text-white', OVER_AURORA)}>{sub}</span>}
          </>
        ) : (
          <span
            className={cn('max-w-[24ch] text-lg leading-snug font-medium text-white', OVER_AURORA)}
          >
            {sub}
          </span>
        )}
      </div>
      {foot && <div className="flex items-center gap-2">{foot}</div>}
    </div>
  )
}
