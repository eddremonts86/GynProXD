import type { InputHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string
  hint?: string
  error?: string
  id?: string
}

export function Input({ label, hint, error, className, id, ...props }: InputProps) {
  const inputId =
    id ?? (label ? `f-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}` : undefined)
  const describedBy = error ? `${inputId}-err` : hint ? `${inputId}-hint` : undefined

  const field = (
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
        className,
      )}
      {...props}
    />
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
