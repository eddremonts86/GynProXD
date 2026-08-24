import type { InputHTMLAttributes } from 'react'
import { Input as ShadcnInput } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string
  id?: string
}

export function Input({ label, className = '', id, ...props }: InputProps) {
  const inputId = id ?? (label ? `in-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}` : undefined)
  const input = (
    <ShadcnInput
      id={inputId}
      className={cn('min-h-11 bg-surface px-4 py-2.5 text-sm', className)}
      {...props}
    />
  )
  if (!label) return input
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={inputId} className="text-xs font-medium tracking-widest text-muted uppercase">
        {label}
      </Label>
      {input}
    </div>
  )
}
