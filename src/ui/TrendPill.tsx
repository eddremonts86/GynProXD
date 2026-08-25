import { TrendDown, TrendUp } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'

interface TrendPillProps {
  /** Signed change over the window, already rounded for display. */
  delta: number
  unit?: string
  window: string
  /**
   * Whether an increase is a good thing; weight loss inverts it. Left unset,
   * the arrow stays neutral, for figures with no better direction.
   */
  positiveIsGood?: boolean
  /** Floating (on a tile or image) or inline (on a card). */
  variant?: 'floating' | 'inline'
  className?: string
}

/** "+12.4 kg last 30 days" with the arrow carrying the direction. */
export function TrendPill({
  delta,
  unit,
  window,
  positiveIsGood,
  variant = 'floating',
  className,
}: TrendPillProps) {
  if (delta === 0) return null
  const rising = delta > 0
  const iconTone =
    positiveIsGood === undefined
      ? 'text-ink-3'
      : rising === positiveIsGood
        ? 'text-good'
        : 'text-danger'
  const Icon = rising ? TrendUp : TrendDown

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium',
        variant === 'floating'
          ? 'bg-surface text-ink shadow-[var(--shadow-panel)]'
          : 'bg-surface-2 text-ink-2',
        className,
      )}
    >
      <Icon size={14} weight="bold" className={iconTone} />
      <span className="num">
        {rising ? '+' : ''}
        {delta}
        {unit ? ` ${unit}` : ''}
      </span>
      <span className="text-ink-3">{window}</span>
    </span>
  )
}
