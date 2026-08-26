import type { ReactNode } from 'react'
import { Tabs as Primitive } from '@base-ui/react/tabs'
import { cn } from '@/lib/utils'

/**
 * Segmented pill tabs, the console's primary sectioning device. The active
 * tab is the same brand pill the navigation uses, so "where am I" reads
 * identically everywhere.
 */
export interface TabDef {
  value: string
  label: string
  /** Small count rendered after the label, e.g. messages sent. */
  count?: number
}

export function Tabs({
  tabs,
  value,
  onValueChange,
  children,
  className,
}: {
  tabs: TabDef[]
  value: string
  onValueChange: (value: string) => void
  children: ReactNode
  className?: string
}) {
  return (
    <Primitive.Root
      value={value}
      onValueChange={(v) => onValueChange(String(v))}
      className={className}
    >
      <Primitive.List className="flex flex-wrap gap-1.5" aria-label="Panel sections">
        {tabs.map((tab) => (
          <Primitive.Tab
            key={tab.value}
            value={tab.value}
            className={cn(
              'flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium',
              'transition-colors duration-150 outline-none',
              'focus-visible:ring-2 focus-visible:ring-brand',
              'data-[active]:bg-brand data-[active]:text-brand-ink',
              'not-data-[active]:text-ink-3 not-data-[active]:hover:bg-surface not-data-[active]:hover:text-ink',
            )}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span className="num text-2xs opacity-70">{tab.count}</span>
            )}
          </Primitive.Tab>
        ))}
      </Primitive.List>
      {children}
    </Primitive.Root>
  )
}

export function TabPanel({
  value,
  children,
  className,
}: {
  value: string
  children: ReactNode
  className?: string
}) {
  return (
    <Primitive.Panel value={value} className={cn('mt-5 outline-none', className)}>
      {children}
    </Primitive.Panel>
  )
}
