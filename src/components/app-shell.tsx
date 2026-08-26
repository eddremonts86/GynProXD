import { useEffect } from 'react'
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
import { ProfileGate } from '@/components/profile-gate'
import { useSession } from '@/store/useSession'
import { activeProfile, lockProfile, resumeSession } from '@/lib/profiles'
import { SignOut } from '@phosphor-icons/react'
import { IconButton } from '@/ui/Button'
import { Avatar } from '@/ui/Avatar'
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
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col lg:flex">
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
                'flex h-11 items-center gap-2.5 rounded-full px-4 text-sm font-medium',
                'transition-colors duration-150',
                active
                  ? 'bg-brand text-brand-ink shadow-[var(--shadow-panel)]'
                  : 'text-ink-3 hover:bg-surface hover:text-ink',
              )}
            >
              <item.icon size={18} weight={active ? 'fill' : 'regular'} />
              {item.label}
            </Link>
          )
        })}
      </nav>

      <div className="flex flex-col gap-3 p-3">
        <SessionRailCard />
        <ProfileFooter />
      </div>
    </aside>
  )
}

function MobileChrome({ pathname }: { pathname: string }) {
  return (
    <>
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between bg-bg/85 px-4 backdrop-blur-md lg:hidden">
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
          className="flex gap-1 bg-bg/95 px-2 py-1.5 pb-[calc(env(safe-area-inset-bottom)+0.375rem)] shadow-[var(--shadow-raised)] backdrop-blur-md"
        >
          {NAV.map((item) => {
            const active = isActive(item, pathname)
            return (
              <Link
                key={item.to}
                to={item.to}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex min-h-12 flex-1 flex-col items-center justify-center gap-0.5 rounded-full text-2xs font-medium',
                  'transition-colors duration-150',
                  active ? 'bg-brand text-brand-ink' : 'text-ink-3',
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

function ProfileFooter() {
  const profileName = useSession((s) => s.profileName)
  const setLocked = useSession((s) => s.setLocked)
  const meta = activeProfile()
  return (
    <div className="flex items-center justify-between gap-2 pt-1">
      <span className="flex min-w-0 items-center gap-2">
        {profileName && <Avatar name={profileName} seed={meta?.id ?? profileName} size="sm" />}
        <span className="min-w-0 flex-col">
          <span className="block truncate text-2xs font-medium text-ink-2">
            {profileName ?? 'Local only'}
          </span>
          {meta?.gym && <span className="block truncate text-2xs text-ink-3">{meta.gym}</span>}
        </span>
      </span>
      <span className="flex shrink-0 items-center">
        <ThemeToggle />
        <IconButton
          size="sm"
          aria-label="Lock this profile"
          onClick={() => {
            void lockProfile().then(setLocked)
          }}
        >
          <SignOut size={16} />
        </IconButton>
      </span>
    </div>
  )
}

export function AppShell() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const status = useSession((s) => s.status)
  const setUnlocked = useSession((s) => s.setUnlocked)
  const setLocked = useSession((s) => s.setLocked)

  /* One resume attempt per boot: a refreshed tab keeps its unlocked profile. */
  useEffect(() => {
    if (status !== 'boot') return
    void resumeSession().then((resumed) => {
      if (resumed) setUnlocked(activeProfile()?.name ?? '')
      else setLocked()
    })
  }, [status, setUnlocked, setLocked])

  if (status === 'boot') {
    return <div className="min-h-[100dvh] bg-bg" aria-busy="true" />
  }

  if (status === 'locked') {
    return <ProfileGate onUnlocked={setUnlocked} />
  }

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
