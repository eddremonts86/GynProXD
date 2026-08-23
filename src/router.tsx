import { createRootRoute, createRoute, createRouter, Link, Outlet } from '@tanstack/react-router'
import { TodayPage } from './routes/Today'
import { LibraryPage } from './routes/Library'
import { HistoryPage } from './routes/History'
import { SettingsPage } from './routes/Settings'
import { PlannerPage } from './routes/Planner'
import { OnboardingPage } from './routes/Onboarding'
import { GeneratedPlanPage } from './routes/GeneratedPlan'

const rootRoute = createRootRoute({
  component: () => (
    <div className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col">
      <header className="sticky top-0 z-10 border-b border-line/60 bg-surface/70 backdrop-blur supports-[backdrop-filter]:bg-surface/60">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-4 px-4 py-3 md:px-6 lg:px-8">
          <Link to="/" className="flex items-center gap-3 focus-visible:outline-none">
            <span className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] bg-gradient-to-br from-accent to-[#8B5E2E] text-sm font-bold tracking-tight text-accent-contrast shadow-sm">
              F
            </span>
            <span className="flex flex-col">
              <span className="font-display text-[22px] leading-none tracking-tight text-ink">Forma</span>
              <span className="text-[10px] font-medium tracking-[0.16em] text-muted uppercase">local training</span>
            </span>
          </Link>
          <span className="hidden md:inline-flex rounded-full border border-line bg-card px-2.5 py-1 text-[10px] font-medium tracking-widest text-muted uppercase">
            Noir Warm · 3D
          </span>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 pb-28 pt-6 md:px-6 md:pt-8 lg:px-8">
        <Outlet />
      </main>
      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/90 backdrop-blur supports-[backdrop-filter]:bg-surface/80 pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto flex w-full max-w-3xl items-stretch justify-around px-2 py-1 md:py-2">
          {[
            ['/', 'Today'],
            ['/planner', 'Planner'],
            ['/library', 'Library'],
            ['/history', 'History'],
            ['/settings', 'Settings'],
          ].map(([to, label]) => (
            <Link
              key={to}
              to={to}
              activeOptions={{ exact: to === '/' }}
              className="relative flex flex-col items-center gap-1 rounded-[var(--radius-md)] px-4 py-2 text-xs font-medium tracking-wide text-muted transition-colors hover:bg-surface-2 hover:text-ink-soft focus-visible:outline-none data-[status=active]:text-accent"
            >
              <span className="hidden data-[status=active]:block absolute -top-1 left-1/2 h-1 w-6 -translate-x-1/2 rounded-full bg-accent" />
              {label}
            </Link>
          ))}
        </div>
      </nav>
    </div>
  ),
})

const todayRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: TodayPage })
const plannerRoute = createRoute({ getParentRoute: () => rootRoute, path: '/planner', component: PlannerPage })
const libraryRoute = createRoute({ getParentRoute: () => rootRoute, path: '/library', component: LibraryPage })
const historyRoute = createRoute({ getParentRoute: () => rootRoute, path: '/history', component: HistoryPage })
const settingsRoute = createRoute({ getParentRoute: () => rootRoute, path: '/settings', component: SettingsPage })
const onboardingRoute = createRoute({ getParentRoute: () => rootRoute, path: '/onboarding', component: OnboardingPage })
const generatedRoute = createRoute({ getParentRoute: () => rootRoute, path: '/generated/$id', component: GeneratedPlanPage })

export const router = createRouter({
  routeTree: rootRoute.addChildren([
    todayRoute,
    plannerRoute,
    libraryRoute,
    historyRoute,
    settingsRoute,
    onboardingRoute,
    generatedRoute,
  ]),
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
