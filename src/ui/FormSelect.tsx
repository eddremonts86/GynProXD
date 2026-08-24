import {
  Select as ShadcnSelectRoot,
  SelectTrigger,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

export interface FormSelectOption {
  value: string
  label: string
}

interface FormSelectProps {
  value: string
  onValueChange: (value: string) => void
  options: FormSelectOption[]
  placeholder?: string
  ariaLabel?: string
  className?: string
  contentClassName?: string
}

export function FormSelect({
  value,
  onValueChange,
  options,
  placeholder = 'Choose…',
  ariaLabel,
  className = '',
  contentClassName = '',
}: FormSelectProps) {
  const current = options.find((o) => o.value === value)
  const display = current?.label ?? placeholder
  return (
    <ShadcnSelectRoot
      value={value || null}
      onValueChange={(v) => onValueChange(String(v ?? ''))}
    >
      <SelectTrigger
        aria-label={ariaLabel}
        className={cn('min-h-10 w-full bg-surface px-3 py-2 text-sm', className)}
      >
        <span className="truncate">{display}</span>
      </SelectTrigger>
      <SelectContent className={cn('max-h-72', contentClassName)}>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </ShadcnSelectRoot>
  )
}
