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

const variantMap: Record<Variant, string> = {
  primary: 'bg-brand text-brand-ink hover:bg-brand-hover disabled:bg-line disabled:text-ink-3',
  secondary:
    'border border-line bg-surface text-ink shadow-[var(--shadow-panel)] hover:border-line-strong hover:bg-surface-2 disabled:opacity-45 disabled:shadow-none',
  ghost: 'text-ink-3 hover:bg-surface-2 hover:text-ink disabled:opacity-45',
  danger: 'bg-danger text-danger-ink hover:opacity-90 disabled:opacity-45',
  dangerQuiet: 'border border-danger/40 text-danger hover:bg-danger-soft disabled:opacity-45',
}

const sizeMap: Record<Size, string> = {
  xs: 'h-8 gap-1.5 px-3 text-2xs',
  sm: 'h-9 gap-1.5 px-3.5 text-xs',
  md: 'h-11 gap-2 px-5 text-sm',
  lg: 'h-[3.25rem] gap-2 px-6 text-lg',
}

export function Button({
  variant = 'primary',
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
