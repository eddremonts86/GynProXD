import {
  Link,
  Outlet,
  useRouterState,
} from '@tanstack/react-router'
import {
  Barbell,
  CalendarBlank,
  ChartLineUp,
  GearSix,
  ListMagnifyingGlass,
} from '@phosphor-icons/react'
import type { Icon } from '@phosphor-icons/react'
import { Wordmark, Mark } from '@/components/brand'
import { ThemeToggle } from '@/components/theme-toggle'
import { SessionRailCard, SessionMobileBar } from '@/components/session-indicator'
import { cn } from '@/lib/utils'

interface NavItem {
  label: string
  to: string
  icon: Icon
  /** Extra routes that should light this item up; onboarding belongs to planning. */
  owns?: string[]
}

const NAV: NavItem[] = [
  { label: 'Today', to: '/', icon: Barbell },
  { label: 'Planner', to: '/planner', icon: CalendarBlank, owns: ['/onboarding', '/generated'] },
  { label: 'Library', to: '/library', icon: ListMagnifyingGlass },
  { label: 'History', to: '/history', icon: ChartLineUp },
  { label: 'Settings', to: '/settings', icon: GearSix },
]

function isActive(item: NavItem, pathname: string): boolean {
  if (item.to === '/') return pathname === '/'
  if (pathname.startsWith(item.to)) return true
  return (item.owns ?? []).some((prefix) => pathname.startsWith(prefix))
}

function DesktopRail({ pathname }: { pathname: string }) {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-line bg-surface lg:flex">
      <div className="px-5 py-5">
        <Link to="/" aria-label="Forma, go to today">
          <Wordmark />
        </Link>
      </div>

      <nav aria-label="Main" className="flex flex-1 flex-col gap-0.5 px-3">
        {NAV.map((item) => {
          const active = isActive(item, pathname)
          return (
            <Link
              key={item.to}
              to={item.to}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'relative flex h-10 items-center gap-2.5 rounded-md px-3 text-sm font-medium',
                'transition-colors duration-150',
                active
                  ? 'bg-brand-soft text-brand'
                  : 'text-ink-3 hover:bg-surface-2 hover:text-ink',
              )}
            >
              {active && (
                <span className="absolute top-2 bottom-2 -left-3 w-0.5 rounded-full bg-brand" />
              )}
              <item.icon size={18} weight={active ? 'fill' : 'regular'} />
              {item.label}
            </Link>
          )
        })}
      </nav>

      <div className="flex flex-col gap-3 p-3">
        <SessionRailCard />
        <div className="flex items-center justify-between border-t border-line pt-3">
          <span className="px-1 text-2xs text-ink-3">Local only. No account.</span>
          <ThemeToggle />
        </div>
      </div>
    </aside>
  )
}

function MobileChrome({ pathname }: { pathname: string }) {
  return (
    <>
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-bg/85 px-4 backdrop-blur-md lg:hidden">
        <Link to="/" aria-label="Forma, go to today" className="flex items-center gap-2">
          <Mark className="size-7" />
          <span className="text-base leading-none font-semibold tracking-tight text-ink">Forma</span>
        </Link>
        <ThemeToggle />
      </header>

      <div className="fixed inset-x-0 bottom-0 z-30 lg:hidden">
        <SessionMobileBar />
        <nav
          aria-label="Main"
          className="flex border-t border-line bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md"
        >
          {NAV.map((item) => {
            const active = isActive(item, pathname)
            return (
              <Link
                key={item.to}
                to={item.to}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex min-h-14 flex-1 flex-col items-center justify-center gap-1 text-2xs font-medium',
                  'transition-colors duration-150',
                  active ? 'text-brand' : 'text-ink-3',
                )}
              >
                <item.icon size={20} weight={active ? 'fill' : 'regular'} />
                {item.label}
              </Link>
            )
          })}
        </nav>
      </div>
    </>
  )
}

export function AppShell() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  return (
    <div className="min-h-[100dvh] bg-bg">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-brand focus:px-3 focus:py-2 focus:text-sm focus:text-brand-ink"
      >
        Skip to content
      </a>
      <DesktopRail pathname={pathname} />
      <MobileChrome pathname={pathname} />
      <main id="main" className="lg:pl-60">
        <div className="mx-auto w-full max-w-[76rem] px-4 py-6 pb-32 md:px-8 md:py-10 lg:pb-12">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
