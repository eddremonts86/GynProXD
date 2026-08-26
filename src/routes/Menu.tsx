import { Link } from '@tanstack/react-router'
import { ForkKnife } from '@phosphor-icons/react'
import { useSession } from '../store/useSession'
import { useMenus } from '../store/useMenus'
import { menuFor } from '../lib/menu'
import { formatShortDate } from '../lib/labels'
import { PageHeader, Section } from '../ui/PageHeader'
import { Panel } from '../ui/Panel'

/** The member's view of their gym's standing kitchen card. */
export function MenuPage() {
  const gym = useSession((s) => s.gym)
  const menus = useMenus((s) => s.menus)
  const menu = menuFor(menus, gym ?? undefined)

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title={gym ? `The kitchen at ${gym}` : 'Gym menu'}
        description={
          menu
            ? `Updated ${formatShortDate(menu.updatedAt.slice(0, 10))}. Order at the counter.`
            : 'What your gym serves, when they publish it.'
        }
      />

      {!menu ? (
        <Panel padding="lg" className="flex flex-col items-start gap-3">
          <ForkKnife size={22} className="text-ink-3" />
          <p className="max-w-[52ch] text-sm text-ink-3">
            {gym
              ? `${gym} has not published a menu yet.`
              : 'This profile has no gym set. Pick one under '}
            {!gym && (
              <>
                <Link to="/settings" className="text-brand underline underline-offset-2">
                  Settings
                </Link>{' '}
                to see its menu here.
              </>
            )}
          </p>
        </Panel>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {menu.sections.map((section) => (
            <Section key={section.name} title={section.name} hint={`${section.items.length}`}>
              <Panel padding="lg">
                <ul className="divide-y divide-line">
                  {section.items.map((item) => (
                    <li key={item.name} className="flex items-baseline gap-4 py-2.5 first:pt-0 last:pb-0">
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-ink">{item.name}</span>
                        {item.desc && (
                          <span className="block text-2xs leading-relaxed text-ink-3">{item.desc}</span>
                        )}
                      </span>
                      {item.price && (
                        <span className="num shrink-0 text-sm font-medium text-ink-2">
                          {item.price} €
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </Panel>
            </Section>
          ))}
        </div>
      )}
    </div>
  )
}
