import { useCallback, useEffect, useRef, useState } from 'react'
import { Minus, Plus } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'

interface NumberFieldProps {
  label: string
  value: string
  onValueChange: (next: string) => void
  step?: number
  min?: number
  max?: number
  unit?: string
  decimals?: number
  className?: string
}

/**
 * Thumb-first numeric control for logging a set. Two 44px targets flank a large
 * tabular readout that stays directly editable, and holding a button repeats so
 * a 40kg jump is one gesture rather than sixteen taps.
 */
export function NumberField({
  label,
  value,
  onValueChange,
  step = 1,
  min = 0,
  max = 9999,
  unit,
  decimals = 0,
  className,
}: NumberFieldProps) {
  const [focused, setFocused] = useState(false)
  const repeatRef = useRef<{ timeout?: number; interval?: number }>({})

  const clamp = useCallback(
    (n: number) => Math.min(max, Math.max(min, n)),
    [min, max],
  )

  const bump = useCallback(
    (direction: 1 | -1) => {
      const current = Number(value)
      const base = Number.isFinite(current) ? current : 0
      const next = clamp(base + direction * step)
      onValueChange(decimals > 0 ? String(Number(next.toFixed(decimals))) : String(Math.round(next)))
    },
    [value, step, clamp, onValueChange, decimals],
  )

  const stopRepeat = useCallback(() => {
    if (repeatRef.current.timeout) window.clearTimeout(repeatRef.current.timeout)
    if (repeatRef.current.interval) window.clearInterval(repeatRef.current.interval)
    repeatRef.current = {}
  }, [])

  const startRepeat = useCallback(
    (direction: 1 | -1) => {
      stopRepeat()
      bump(direction)
      repeatRef.current.timeout = window.setTimeout(() => {
        repeatRef.current.interval = window.setInterval(() => bump(direction), 70)
      }, 380)
    },
    [bump, stopRepeat],
  )

  useEffect(() => stopRepeat, [stopRepeat])

  const stepperClass =
    'flex size-11 shrink-0 items-center justify-center rounded-md border border-line bg-surface text-ink-2 ' +
    'transition-colors duration-150 hover:border-line-strong hover:bg-surface-2 hover:text-ink active:translate-y-px'

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <span className="text-2xs font-medium text-ink-3">{label}</span>
      <div
        className={cn(
          'flex items-center gap-1.5 rounded-md border bg-surface p-1.5 transition-colors duration-150',
          focused ? 'border-brand' : 'border-line',
        )}
      >
        <button
          type="button"
          aria-label={`Decrease ${label}`}
          className={stepperClass}
          onPointerDown={() => startRepeat(-1)}
          onPointerUp={stopRepeat}
          onPointerLeave={stopRepeat}
          onPointerCancel={stopRepeat}
        >
          <Minus size={18} weight="bold" />
        </button>

        <span className="flex min-w-0 flex-1 items-baseline justify-center gap-1">
          <input
            value={value}
            onChange={(e) => onValueChange(e.target.value.replace(/[^\d.,]/g, '').replace(',', '.'))}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            inputMode={decimals > 0 ? 'decimal' : 'numeric'}
            aria-label={label}
            placeholder="0"
            className="num w-full min-w-0 bg-transparent text-center text-2xl font-semibold text-ink outline-none placeholder:text-ink-3"
          />
          {unit && <span className="shrink-0 text-xs text-ink-3">{unit}</span>}
        </span>

        <button
          type="button"
          aria-label={`Increase ${label}`}
          className={stepperClass}
          onPointerDown={() => startRepeat(1)}
          onPointerUp={stopRepeat}
          onPointerLeave={stopRepeat}
          onPointerCancel={stopRepeat}
        >
          <Plus size={18} weight="bold" />
        </button>
      </div>
    </div>
  )
}
