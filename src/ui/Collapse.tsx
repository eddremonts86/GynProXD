import type { ReactNode } from 'react'
import { Collapsible } from '@base-ui/react/collapsible'
import { CaretDown } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'

/**
 * Disclosure row. The trigger is ONLY the chevron + header text passed to
 * it — interactive children (inputs, buttons) render beside the trigger,
 * never inside it, so editing never fights the toggle.
 */
export function Collapse({
  header,
  headerExtras,
  defaultOpen = false,
  children,
  className,
}: {
  /** Toggles the panel. Text and passive content only. */
  header: ReactNode
  /** Interactive controls docked at the row's right; do not toggle. */
  headerExtras?: ReactNode
  defaultOpen?: boolean
  children: ReactNode
  className?: string
}) {
  return (
    <Collapsible.Root defaultOpen={defaultOpen} className={className}>
      <div className="flex items-center gap-2">
        <Collapsible.Trigger
          className={cn(
            'group/trigger flex min-w-0 flex-1 items-center gap-2 rounded-md py-1 text-left',
            'text-sm font-semibold text-ink transition-colors hover:text-ink-2',
          )}
        >
          <CaretDown
            size={14}
            weight="bold"
            className="shrink-0 text-ink-3 transition-transform duration-150 group-data-[panel-open]/trigger:rotate-180"
          />
          <span className="min-w-0 flex-1">{header}</span>
        </Collapsible.Trigger>
        {headerExtras && <span className="flex shrink-0 items-center gap-1">{headerExtras}</span>}
      </div>
      <Collapsible.Panel
        className={cn(
          'overflow-hidden',
          'h-(--collapsible-panel-height) transition-[height] duration-150 ease-out',
          'data-[starting-style]:h-0 data-[ending-style]:h-0',
        )}
      >
        <div className="pt-2">{children}</div>
      </Collapsible.Panel>
    </Collapsible.Root>
  )
}
