import * as React from 'react'

import { cn } from '@/lib/utils'

/**
 * A paragraph field, styled like `Input` and given room.
 *
 * Text that touches the edge of its box reads as a mistake, and a paragraph
 * needs more air than a one-line field: a full step of inset on every side and
 * a relaxed line height. The shadcn default this replaced had ten pixels and
 * tokens the rest of the app does not use.
 */
function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'field-sizing-content min-h-32 w-full rounded-md border border-line bg-surface px-4 py-3.5',
        'text-sm leading-relaxed text-ink placeholder:text-ink-3',
        'transition-colors duration-150 hover:border-line-strong focus:border-brand focus:outline-none',
        'disabled:cursor-not-allowed disabled:opacity-45',
        'aria-invalid:border-danger',
        className,
      )}
      {...props}
    />
  )
}

export { Textarea }
