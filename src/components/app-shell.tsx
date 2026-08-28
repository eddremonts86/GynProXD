import { useEffect, useMemo, useRef } from 'react'
import {
  Link,
  Outlet,
  useNavigate,
  useRouterState,
} from '@tanstack/react-router'
import {
  Barbell,
  BellSimple,
  CalendarBlank,
  ChartLineUp,
  GearSix,
  ListMagnifyingGlass,
  ShieldCheck,
  Storefront,
  Trophy,
} from '@phosphor-icons/react'
import type { Icon } from '@phosphor-icons/react'
import { Wordmark, Mark } from '@/components/brand'
import { ThemeToggle } from '@/components/theme-toggle'
import { SessionRailCard, SessionMobileBar } from '@/components/session-indicator'
import { ProfileGate } from '@/components/profile-gate'
import { GymBanner } from '@/components/gym-banner'
import { useSession } from '@/store/useSession'
import { useMessages } from '@/store/useMessages'
import { useGym } from '@/store/useGym'
import { unreadCount } from '@/lib/messages'
import { notifyRetestDue, notifyUnread } from '@/lib/notify'
import { testAgeDays, testIsStale } from '@/lib/fitness-test'
import { todayIso } from '@/lib/dates'
import { activeProfile, lockProfile, resumeSession, type ProfileRole } from '@/lib/profiles'
import { readSyncLink, syncNow } from '@/lib/sync'
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
  { label: 'Challenges', to: '/challenges', icon: Trophy },
  { label: 'Library', to: '/library', icon: ListMagnifyingGlass },
  { label: 'History', to: '/history', icon: ChartLineUp },
]

const PANEL_ITEM: Partial<Record<ProfileRole, { label: string; to: string; icon: Icon }>> = {
  gym: { label: 'Gym panel', to: '/gym', icon: Storefront },
  admin: { label: 'Admin', to: '/admin', icon: ShieldCheck },
}

/**
 * The role panel, Inbox bell and Settings gear, top right on every
 * breakpoint. The nav below stays identical for everyone: work areas only.
 * Gym operators get no bell: authors never receive their own broadcasts,
 * so their inbox is empty by construction — their surface is the panel.
 */
function UtilityCluster({ pathname }: { pathname: string }) {
  const role = useSession((s) => s.role)
  const unread = useUnread()
  const panel = PANEL_ITEM[role]
  const panelActive = panel ? pathname.startsWith(panel.to) : false
  const inboxActive = pathname.startsWith('/inbox') || pathname.startsWith('/menu')
  const settingsActive = pathname.startsWith('/settings')
  const itemClass = (active: boolean) =>
    cn(
      'relative flex size-9 items-center justify-center rounded-full transition-colors duration-150',
      active ? 'bg-brand text-brand-ink' : 'text-ink-3 hover:bg-surface hover:text-ink',
    )
  return (
    <span className="flex items-center gap-0.5">
      {panel && (
        <Link
          to={panel.to}
          aria-label={panel.label}
          aria-current={panelActive ? 'page' : undefined}
          className={itemClass(panelActive)}
        >
          <panel.icon size={20} weight={panelActive ? 'fill' : 'regular'} />
        </Link>
      )}
      {role !== 'gym' && (
        <Link
          to="/inbox"
          aria-label={unread > 0 ? `Inbox, ${unread} unread` : 'Inbox'}
          aria-current={inboxActive ? 'page' : undefined}
          className={itemClass(inboxActive)}
        >
          <BellSimple size={20} weight={inboxActive ? 'fill' : 'regular'} />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5">
              <UnreadBadge count={unread} />
            </span>
          )}
        </Link>
      )}
      <Link
        to="/settings"
        aria-label="Settings"
        aria-current={settingsActive ? 'page' : undefined}
        className={itemClass(settingsActive)}
      >
        <GearSix size={20} weight={settingsActive ? 'fill' : 'regular'} />
      </Link>
    </span>
  )
}

/** Unread gym messages for the unlocked profile. */
function useUnread(): number {
  const profileId = useSession((s) => s.profileId)
  const gym = useSession((s) => s.gym)
  const messages = useMessages((s) => s.messages)
  return useMemo(
    () => (profileId ? unreadCount(messages, { id: profileId, gym: gym ?? undefined }) : 0),
    [messages, profileId, gym],
  )
}

function UnreadBadge({ count }: { count: number }) {
  if (count === 0) return null
  return (
    <span
      aria-label={`${count} unread`}
      className="num flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] leading-none font-semibold text-brand-ink"
    >
      {count > 9 ? '9+' : count}
    </span>
  )
}

function isActive(item: NavItem, pathname: string): boolean {
  if (item.to === '/') return pathname === '/'
  if (pathname.startsWith(item.to)) return true
  return (item.owns ?? []).some((prefix) => pathname.startsWith(prefix))
}

function DesktopRail({ pathname }: { pathname: string }) {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col lg:flex">
      <div className="px-5 py-5">
        <Link to="/" aria-label="enForma, go to today">
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
              <span className="flex-1">{item.label}</span>
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
      <header data-print="hide" className="sticky top-0 z-30 flex h-14 items-center justify-between bg-bg/85 px-4 backdrop-blur-md lg:hidden">
        <Link to="/" aria-label="enForma, go to today" className="flex items-center gap-2">
          <Mark className="size-7" />
          <span className="text-base leading-none font-semibold tracking-tight text-ink">enForma</span>
        </Link>
        <span className="flex items-center gap-0.5">
          <UtilityCluster pathname={pathname} />
          <ThemeToggle />
        </span>
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

/* Linked profiles catch up in the background on unlock; failures stay quiet
   here because Settings → Data shows them where they can be acted on. */
function syncQuietly(profileId: string): void {
  if (readSyncLink(profileId)) void syncNow(profileId)
}

export function AppShell() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const status = useSession((s) => s.status)
  const setUnlocked = useSession((s) => s.setUnlocked)
  const setLocked = useSession((s) => s.setLocked)
  const gym = useSession((s) => s.gym)
  const unread = useUnread()
  const navigate = useNavigate()

  /* Operators and admins unlocking onto Today land on their own desk
     instead; any deeper route is left alone (resume where you were). */
  const landFor = (role: ProfileRole) => {
    if (window.location.pathname !== '/') return
    if (role === 'gym') void navigate({ to: '/gym' })
    if (role === 'admin') void navigate({ to: '/admin' })
  }

  /* System notification when unread grows: on unlock, and live when a gym
     publishes from another tab (the storage event rehydrates the bus). */
  const seenUnread = useRef(0)
  useEffect(() => {
    if (status === 'unlocked' && unread > seenUnread.current) {
      void notifyUnread(unread, gym ?? 'Your gym')
    }
    seenUnread.current = unread
  }, [unread, status, gym])

  /* Retest nudge, checked when a profile comes up rather than on a timer:
     a local-first app has no scheduler, and the marker in notify.ts keeps
     it to one notification per stale test. */
  const fitnessTest = useGym((s) => s.fitnessTest)
  useEffect(() => {
    if (status !== 'unlocked' || !fitnessTest) return
    if (!testIsStale(fitnessTest, todayIso())) return
    const weeks = Math.floor(testAgeDays(fitnessTest, todayIso()) / 7)
    void notifyRetestDue(fitnessTest.takenAt, weeks)
  }, [status, fitnessTest])

  /* One resume attempt per boot: a refreshed tab keeps its unlocked profile. */
  useEffect(() => {
    if (status !== 'boot') return
    void resumeSession().then((resumed) => {
      if (resumed) {
        const meta = activeProfile()
        if (meta) {
          setUnlocked(meta)
          syncQuietly(meta.id)
        }
      }
      else setLocked()
    })
  }, [status, setUnlocked, setLocked])

  if (status === 'boot') {
    return <div className="min-h-[100dvh] bg-bg" aria-busy="true" />
  }

  if (status === 'locked') {
    return (
      <ProfileGate
        onUnlocked={() => {
          const meta = activeProfile()
          if (meta) {
            setUnlocked(meta)
            landFor(meta.role)
            syncQuietly(meta.id)
          }
        }}
      />
    )
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
      <main id="main" className="lg:pl-60 print:pl-0">
        <div className="mx-auto w-full max-w-[76rem] px-4 py-6 pb-32 md:px-8 md:py-10 lg:pb-12">
          {/* Pulled up out of the content padding so it sits level with the
              rail's wordmark, reading as the top bar's right side. */}
          <div className="-mt-[1.375rem] mb-4 hidden justify-end lg:flex">
            <UtilityCluster pathname={pathname} />
          </div>
          <GymBanner />
          <Outlet />
        </div>
      </main>
    </div>
  )
}
