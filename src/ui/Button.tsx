import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/utils'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'dangerQuiet'
type Size = 'xs' | 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  /** Optional so Base UI's `render` prop can inject its own children. */
  children?: ReactNode
}

/**
 * Three rungs, and the gap between them has to be visible or the ladder does
 * no work.
 *
 * `secondary` used to sit on `--surface`, which in the dark theme is #1e1e1b
 * against a #141412 page: technically a step, visually none. It moves to
 * `--surface-2` with the stronger hairline, so it reads as a control in both
 * themes rather than only in the light one.
 *
 * `ghost` moves up from `--ink-3` to `--ink-2`. It is the quiet rung, not the
 * unreadable one; a tertiary action still has to be findable.
 */
const variantMap: Record<Variant, string> = {
  primary:
    'bg-brand text-brand-ink shadow-[var(--shadow-panel)] hover:bg-brand-hover ' +
    'disabled:bg-line disabled:text-ink-3 disabled:shadow-none',
  secondary:
    'border border-line-strong bg-surface-2 text-ink hover:border-ink-3 hover:bg-line ' +
    'disabled:opacity-45',
  ghost: 'text-ink-2 hover:bg-surface-2 hover:text-ink disabled:opacity-45',
  danger:
    'bg-danger text-danger-ink shadow-[var(--shadow-panel)] hover:opacity-90 disabled:opacity-45 disabled:shadow-none',
  dangerQuiet: 'border border-danger/40 text-danger hover:bg-danger-soft disabled:opacity-45',
}

const sizeMap: Record<Size, string> = {
  xs: 'h-8 gap-1.5 px-3 text-2xs',
  sm: 'h-9 gap-1.5 px-3.5 text-xs',
  md: 'h-11 gap-2 px-5 text-sm',
  lg: 'h-[3.25rem] gap-2 px-6 text-lg',
}

/**
 * The default is deliberately the quiet one.
 *
 * It used to be `primary`, so the loudest treatment landed on any button
 * nobody had thought about — 45 of them across the app, more than a third of
 * every button here. A screen with six solid buttons has no primary action at
 * all. Now the solid treatment has to be asked for, which makes it a decision
 * instead of an accident: one per surface, on the control that finishes the
 * job the member came to do.
 */
export function Button({
  variant = 'secondary',
  size = 'md',
  className,
  children,
  disabled,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled}
      className={cn(
        'inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-full font-medium',
        'transition-[background-color,border-color,color,transform] duration-150 ease-[var(--ease-out-expo)]',
        'active:translate-y-px disabled:pointer-events-none disabled:active:translate-y-0',
        variantMap[variant],
        sizeMap[size],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
}

/** Square icon-only control. Always pair with aria-label. */
export function IconButton({
  variant = 'ghost',
  size = 'md',
  className,
  children,
  ...props
}: ButtonProps) {
  const square = { xs: 'w-8', sm: 'w-9', md: 'w-11', lg: 'w-[3.25rem]' }[size]
  return (
    <Button variant={variant} size={size} className={cn('px-0', square, className)} {...props}>
      {children}
    </Button>
  )
}
