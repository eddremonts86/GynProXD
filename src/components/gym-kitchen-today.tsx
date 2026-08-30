import { Link } from '@tanstack/react-router'
import { Storefront } from '@phosphor-icons/react'
import { useSession } from '../store/useSession'
import { useMenus } from '../store/useMenus'
import { countItems, menuFor } from '../lib/menu'
import { Panel } from '../ui/Panel'
import { SECTION_ACTION, Section } from '../ui/PageHeader'
import { cn } from '@/lib/utils'

/**
 * What the member's own gym is serving, in the slot the generic recipe used to
 * hold. This is the only block on Today that leads somewhere money changes
 * hands, so it gets the prime food slot whenever there is a kitchen card to
 * show; the public recipe of the day drops below it rather than disappearing,
 * because the free thing is what brings the member here in the first place.
 *
 * It shows the gym's own first section untouched: they ordered the card in the
 * panel, so the top of it is their headline, not ours.
 */

/** Enough to tempt, not so much that the page becomes the menu. */
const PREVIEW_ITEMS = 4

export function GymKitchenToday({ stacked = false }: { stacked?: boolean }) {
  const gym = useSession((s) => s.gym)
  const menus = useMenus((s) => s.menus)
  const menu = menuFor(menus, gym ?? undefined)

  if (!menu || !gym) return null

  const headline = menu.sections.find((s) => s.items.length > 0)
  if (!headline) return null

  const shown = headline.items.slice(0, PREVIEW_ITEMS)
  const total = countItems(menu)
  const rest = total - shown.length

  return (
    <Section
      title={`Today at ${gym}`}
      className={stacked ? 'h-full self-stretch' : undefined}
      action={
        <Link to="/menu" className={SECTION_ACTION}>
          Full menu
        </Link>
      }
    >
      {/* The one surface on Today that leads anywhere money changes hands, so
          it takes the accent. It cannot collide with the local-only notice
          that also carries it: that one shows only when there is no gym, and
          this one only when there is. */}
      <Panel
        padding="none"
        className={cn('aurora-edge overflow-hidden', stacked ? 'flex flex-1 flex-col' : undefined)}
      >
        <div className="flex items-center gap-2.5 border-b border-line px-5 py-3.5">
          <Storefront size={18} weight="regular" className="shrink-0 text-ink-3" />
          <span className="text-sm font-semibold text-ink">{headline.name}</span>
        </div>

        <ul className="divide-y divide-line px-5">
          {shown.map((item) => (
            <li key={item.name} className="flex items-baseline gap-4 py-3">
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-ink">{item.name}</span>
                {item.desc && (
                  <span className="mt-0.5 block text-xs leading-relaxed text-ink-3">
                    {item.desc}
                  </span>
                )}
              </span>
              {item.price && (
                <span className="num shrink-0 text-lg leading-none font-semibold text-ink">
                  {item.price}
                </span>
              )}
            </li>
          ))}
        </ul>

        <Link
          to="/menu"
          className={cn(
            'mt-auto flex items-center justify-between gap-3 border-t border-line px-5 py-3.5',
            'text-sm font-medium text-ink transition-colors duration-150 hover:bg-surface-2',
          )}
        >
          <span>{rest > 0 ? `See ${rest} more on the card` : 'See the full card'}</span>
          <span aria-hidden="true">&rarr;</span>
        </Link>
      </Panel>
    </Section>
  )
}
