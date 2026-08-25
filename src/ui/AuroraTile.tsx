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
 * dot-matrix hero figure. White text is verified at 3:1 (large) and 4.5:1
 * (small) against the gradient's saturated center in both themes.
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
      <span className="text-sm font-medium text-white/90">{label}</span>
      <div className="flex flex-col gap-1">
        {value !== undefined ? (
          <>
            <DotNumber value={value} unit={unit} size="xl" unitClassName="text-white/90" />
            {sub && <span className="text-xs text-white/90">{sub}</span>}
          </>
        ) : (
          <span className="max-w-[24ch] text-lg leading-snug font-medium text-white">{sub}</span>
        )}
      </div>
      {foot && <div className="flex items-center gap-2">{foot}</div>}
    </div>
  )
}
