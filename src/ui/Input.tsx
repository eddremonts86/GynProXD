import type { InputHTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string
  hint?: string
  error?: string
  /** Unit shown inside the field ("kg", "cm"), so rows keep one height. */
  suffix?: string
  /** Interactive node docked inside the field's right edge (e.g. a reveal toggle). */
  trailing?: ReactNode
  id?: string
}

export function Input({ label, hint, error, suffix, trailing, className, id, ...props }: InputProps) {
  const inputId =
    id ?? (label ? `f-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}` : undefined)
  const describedBy = error ? `${inputId}-err` : hint ? `${inputId}-hint` : undefined

  const control = (
    <input
      id={inputId}
      aria-invalid={error ? true : undefined}
      aria-describedby={describedBy}
      className={cn(
        'h-11 w-full rounded-md border bg-surface px-3 text-sm text-ink',
        'placeholder:text-ink-3 transition-colors duration-150',
        'focus:border-brand focus:outline-none',
        'disabled:cursor-not-allowed disabled:opacity-45',
        error ? 'border-danger' : 'border-line hover:border-line-strong',
        (suffix || trailing) && 'pr-10',
        className,
      )}
      {...props}
    />
  )

  const field =
    suffix || trailing ? (
      <span className="relative block">
        {control}
        {suffix && (
          <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-ink-3">
            {suffix}
          </span>
        )}
        {trailing && (
          <span className="absolute top-1/2 right-1 -translate-y-1/2">{trailing}</span>
        )}
      </span>
    ) : (
      control
    )

  if (!label && !hint && !error) return field

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={inputId} className="text-2xs font-medium text-ink-3">
          {label}
        </label>
      )}
      {field}
      {error ? (
        <p id={`${inputId}-err`} className="text-2xs text-danger">
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${inputId}-hint`} className="text-2xs text-ink-3">
            {hint}
          </p>
        )
      )}
    </div>
  )
}
