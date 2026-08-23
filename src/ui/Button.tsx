import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost'
type Size = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  children: ReactNode
}

const variantMap: Record<Variant, string> = {
  primary:
    'bg-accent text-accent-contrast hover:bg-accent-hover disabled:bg-accent/30 disabled:text-accent-contrast/60 border border-transparent shadow-sm',
  secondary:
    'border border-line bg-card text-ink-soft hover:border-line-strong hover:bg-card-hover hover:text-ink disabled:opacity-40',
  ghost: 'text-muted hover:bg-surface-2 hover:text-ink-soft disabled:opacity-40 border border-transparent',
}

const sizeMap: Record<Size, string> = {
  sm: 'px-3 py-2 text-xs font-semibold rounded-[var(--radius-md)]',
  md: 'px-4 py-2.5 text-sm font-semibold rounded-[var(--radius-md)]',
  lg: 'px-5 py-4 text-base font-semibold rounded-[var(--radius-lg)]',
}

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      disabled={disabled}
      className={[
        'inline-flex items-center justify-center transition-colors focus-visible:outline-none disabled:cursor-not-allowed',
        'font-sans tracking-wide',
        variantMap[variant],
        sizeMap[size],
        className,
      ].join(' ')}
      {...props}
    >
      {children}
    </button>
  )
}
