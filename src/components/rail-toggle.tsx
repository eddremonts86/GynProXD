import { SidebarSimple } from '@phosphor-icons/react'
import { toggleRail, useRailHidden } from '@/hooks/use-rail'
import { IconButton } from '@/ui/Button'
import { cn } from '@/lib/utils'

/**
 * Folds the desktop rail away and brings it back.
 *
 * Two placements, one control. While the rail is open it sits in its header,
 * beside the wordmark. Once folded it becomes a fixed button in the corner the
 * rail used to occupy — the one thing this must never do is leave someone on a
 * desktop with no way back to the navigation.
 *
 * Hidden below `lg`, where there is no rail to fold.
 */
export function RailToggle({ floating = false }: { floating?: boolean }) {
  const hidden = useRailHidden()

  /* Each placement renders only in its own state, so the two never collide. */
  if (floating !== hidden) return null

  return (
    <IconButton
      size="sm"
      aria-label={hidden ? 'Show the navigation' : 'Hide the navigation'}
      title={hidden ? 'Show the navigation' : 'Hide the navigation'}
      onClick={toggleRail}
      className={cn(
        'hidden lg:inline-flex',
        floating && 'fixed top-4 left-4 z-40 bg-surface shadow-[var(--shadow-panel)]',
      )}
    >
      <SidebarSimple size={18} />
    </IconButton>
  )
}
