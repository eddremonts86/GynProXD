import * as React from 'react'
import { createRootRoute, createRoute, createRouter } from '@tanstack/react-router'
import { RouteFallback } from '@/components/route-skeleton'
import { AppShell } from '@/components/app-shell'

const TodayPage = React.lazy(() => import('./routes/Today').then((m) => ({ default: m.TodayPage })))
const LibraryPage = React.lazy(() =>
  import('./routes/Library').then((m) => ({ default: m.LibraryPage })),
)
const HistoryPage = React.lazy(() =>
  import('./routes/History').then((m) => ({ default: m.HistoryPage })),
)
const SettingsPage = React.lazy(() =>
  import('./routes/Settings').then((m) => ({ default: m.SettingsPage })),
)
const PlannerPage = React.lazy(() =>
  import('./routes/Planner').then((m) => ({ default: m.PlannerPage })),
)
const OnboardingPage = React.lazy(() =>
  import('./routes/Onboarding').then((m) => ({ default: m.OnboardingPage })),
)
const GeneratedPlanPage = React.lazy(() =>
  import('./routes/GeneratedPlan').then((m) => ({ default: m.GeneratedPlanPage })),
)
const InboxPage = React.lazy(() => import('./routes/Inbox').then((m) => ({ default: m.InboxPage })))
const GymPanelPage = React.lazy(() =>
  import('./routes/GymPanel').then((m) => ({ default: m.GymPanelPage })),
)
const AdminPage = React.lazy(() => import('./routes/Admin').then((m) => ({ default: m.AdminPage })))
const MenuPage = React.lazy(() => import('./routes/Menu').then((m) => ({ default: m.MenuPage })))
const NotFoundPage = React.lazy(() =>
  import('./routes/NotFound').then((m) => ({ default: m.NotFoundPage })),
)
const ChallengesPage = React.lazy(() =>
  import('./routes/Challenges').then((m) => ({ default: m.ChallengesPage })),
)
const StoryPage = React.lazy(() =>
  import('./routes/Story').then((m) => ({ default: m.StoryPage })),
)
const FitnessTestPage = React.lazy(() =>
  import('./routes/FitnessTest').then((m) => ({ default: m.FitnessTestPage })),
)

const rootRoute = createRootRoute({
  component: AppShell,
  notFoundComponent: () => (
    <React.Suspense fallback={<RouteFallback />}>
      <NotFoundPage />
    </React.Suspense>
  ),
})

/** `const P` keeps the literal path so `navigate({ to })` stays type-checked. */
function lazyRoute<const P extends string>(path: P, Component: React.ComponentType) {
  return createRoute({
    getParentRoute: () => rootRoute,
    path,
    component: () => (
      <React.Suspense fallback={<RouteFallback />}>
        <Component />
      </React.Suspense>
    ),
  })
}

export const router = createRouter({
  routeTree: rootRoute.addChildren([
    lazyRoute('/', TodayPage),
    lazyRoute('/planner', PlannerPage),
    lazyRoute('/challenges', ChallengesPage),
    lazyRoute('/story', StoryPage),
    lazyRoute('/library', LibraryPage),
    lazyRoute('/history', HistoryPage),
    lazyRoute('/settings', SettingsPage),
    lazyRoute('/inbox', InboxPage),
    lazyRoute('/menu', MenuPage),
    lazyRoute('/gym', GymPanelPage),
    lazyRoute('/admin', AdminPage),
    lazyRoute('/fitness-test', FitnessTestPage),
    lazyRoute('/onboarding', OnboardingPage),
    lazyRoute('/generated/$id', GeneratedPlanPage),
  ]),
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
