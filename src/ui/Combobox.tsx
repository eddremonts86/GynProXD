import { Combobox as Primitive } from '@base-ui/react/combobox'
import { CaretDown, Plus } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'

/**
 * Free-text combobox: the typed text IS the value, the list only suggests.
 * When the text matches nothing, the last row offers to add it, so new
 * entries (a gym nobody registered yet) cost one keystroke, not a form.
 */
interface ComboboxProps {
  value: string
  onValueChange: (value: string) => void
  options: string[]
  label?: string
  hint?: string
  error?: string
  placeholder?: string
  /** Verb shown on the create row, e.g. "Add gym". */
  createLabel?: string
  id?: string
}

export function Combobox({
  value,
  onValueChange,
  options,
  label,
  hint,
  error,
  placeholder,
  createLabel = 'Add',
  id,
}: ComboboxProps) {
  const inputId =
    id ?? (label ? `f-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}` : undefined)
  const trimmed = value.trim()
  const exists = options.some((o) => o.toLowerCase() === trimmed.toLowerCase())
  /* The create candidate is a real item so keyboard selection reaches it. */
  const items = trimmed.length > 0 && !exists ? [...options, trimmed] : options

  const control = (
    <Primitive.Root
      items={items}
      inputValue={value}
      onInputValueChange={(next, details) => {
        /* Typed text is the value. Ignore the library's own resets (blur,
           escape), which would wipe a name typed but never "selected". */
        if (
          details.reason === 'input-change' ||
          details.reason === 'item-press' ||
          details.reason === 'clear-press'
        ) {
          onValueChange(next)
        }
      }}
      onValueChange={(picked) => {
        if (typeof picked === 'string') onValueChange(picked)
      }}
    >
      <div className="relative">
        <Primitive.Input
          id={inputId}
          placeholder={placeholder}
          aria-invalid={error ? true : undefined}
          className={cn(
            'h-11 w-full rounded-md border bg-surface px-3 pr-10 text-sm text-ink',
            'placeholder:text-ink-3 transition-colors duration-150',
            'focus:border-brand focus:outline-none',
            error ? 'border-danger' : 'border-line hover:border-line-strong',
          )}
        />
        <Primitive.Trigger
          aria-label={label ? `Show ${label.toLowerCase()} options` : 'Show options'}
          className="absolute top-1/2 right-1 flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-ink-3"
        >
          <Primitive.Icon>
            <CaretDown weight="bold" className="size-4" />
          </Primitive.Icon>
        </Primitive.Trigger>
      </div>

      <Primitive.Portal>
        <Primitive.Positioner sideOffset={6} className="isolate z-50">
          <Primitive.Popup
            className={cn(
              'z-50 max-h-64 w-(--anchor-width) overflow-y-auto rounded-lg bg-popover p-1',
              'text-popover-foreground shadow-md ring-1 ring-foreground/10',
              'data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95',
              'data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 duration-100',
            )}
          >
            <Primitive.Empty className="px-2 py-1.5 text-2xs text-ink-3">
              Type to add the first one.
            </Primitive.Empty>
            <Primitive.List>
              {(item: string) => {
                const isCreate = !options.includes(item)
                return (
                  <Primitive.Item
                    key={isCreate ? `__create__${item}` : item}
                    value={item}
                    className={cn(
                      'flex w-full cursor-default items-center gap-1.5 rounded-md px-2 py-1.5 text-sm select-none',
                      'data-highlighted:bg-accent data-highlighted:text-accent-foreground',
                      isCreate && 'text-ink-2',
                    )}
                  >
                    {isCreate ? (
                      <>
                        <Plus size={14} weight="bold" className="shrink-0 text-brand" />
                        <span className="truncate">
                          {createLabel} “{item}”
                        </span>
                      </>
                    ) : (
                      <span className="truncate">{item}</span>
                    )}
                  </Primitive.Item>
                )
              }}
            </Primitive.List>
          </Primitive.Popup>
        </Primitive.Positioner>
      </Primitive.Portal>
    </Primitive.Root>
  )

  if (!label && !hint && !error) return control
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={inputId} className="text-2xs font-medium text-ink-3">
          {label}
        </label>
      )}
      {control}
      {error ? (
        <p className="text-2xs text-danger">{error}</p>
      ) : (
        hint && <p className="text-2xs text-ink-3">{hint}</p>
      )}
    </div>
  )
}
