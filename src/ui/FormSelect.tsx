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
  label?: string
  placeholder?: string
  ariaLabel?: string
  /** md matches Input (44px); sm matches the small button row (36px). */
  size?: 'md' | 'sm'
  className?: string
  contentClassName?: string
}

export function FormSelect({
  value,
  onValueChange,
  options,
  label,
  placeholder = 'Select',
  ariaLabel,
  size = 'md',
  className,
  contentClassName,
}: FormSelectProps) {
  const current = options.find((o) => o.value === value)

  const control = (
    <ShadcnSelectRoot value={value || null} onValueChange={(v) => onValueChange(String(v ?? ''))}>
      <SelectTrigger
        aria-label={ariaLabel ?? label}
        size={size === 'sm' ? 'sm' : 'default'}
        className={cn(
          'w-full rounded-md border-line bg-surface px-3 text-sm text-ink',
          'hover:border-line-strong focus:border-brand',
          className,
        )}
      >
        <span className={cn('truncate', !current && 'text-ink-3')}>
          {current?.label ?? placeholder}
        </span>
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

  if (!label) return control
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-2xs font-medium text-ink-3">{label}</span>
      {control}
    </div>
  )
}
