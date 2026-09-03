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
const GymLandingPage = React.lazy(() =>
  import('./components/gym-landing').then((m) => ({ default: m.GymLanding })),
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
const RecipesPage = React.lazy(() =>
  import('./routes/Recipes').then((m) => ({ default: m.RecipesPage })),
)
const RecipePage = React.lazy(() =>
  import('./routes/Recipe').then((m) => ({ default: m.RecipePage })),
)
const StoryPage = React.lazy(() =>
  import('./routes/Story').then((m) => ({ default: m.StoryPage })),
)
const FitnessTestPage = React.lazy(() =>
  import('./routes/FitnessTest').then((m) => ({ default: m.FitnessTestPage })),
)
const DayPage = React.lazy(() => import('./routes/Day').then((m) => ({ default: m.DayPage })))

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

/* The recipe page carries the portions a suggestion recommended, so opening a
   plate from Today lands on the numbers the card promised. */
const recipeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/recipe/$id',
  validateSearch: (search: Record<string, unknown>): { p?: number } => {
    const raw = Number(search.p)
    return Number.isFinite(raw) && raw >= 1 && raw <= 12 ? { p: Math.round(raw) } : {}
  },
  component: () => (
    <React.Suspense fallback={<RouteFallback />}>
      <RecipePage />
    </React.Suspense>
  ),
})

/**
 * The open message lives in the URL rather than in component state.
 *
 * Which buys three things for one line: the back button closes a message
 * instead of leaving the inbox, a reload lands where you were, and a
 * notification can deep-link to the message it is about.
 */
const inboxRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/inbox',
  validateSearch: (search: Record<string, unknown>): { m?: string } =>
    typeof search.m === 'string' && search.m.length > 0 && search.m.length <= 64
      ? { m: search.m }
      : {},
  component: () => (
    <React.Suspense fallback={<RouteFallback />}>
      <InboxPage />
    </React.Suspense>
  ),
})

export const router = createRouter({
  /* A cross-fade between screens on navigation — the small thing that reads as
     "app", not "web page". The transition is defined in index.css and is a
     no-op under prefers-reduced-motion. */
  defaultViewTransition: true,
  scrollRestoration: true,
  routeTree: rootRoute.addChildren([
    lazyRoute('/', TodayPage),
    lazyRoute('/day', DayPage),
    lazyRoute('/planner', PlannerPage),
    lazyRoute('/challenges', ChallengesPage),
    lazyRoute('/story', StoryPage),
    lazyRoute('/library', LibraryPage),
    lazyRoute('/history', HistoryPage),
    lazyRoute('/settings', SettingsPage),
    inboxRoute,
    lazyRoute('/for-gyms', GymLandingPage),
    lazyRoute('/menu', MenuPage),
    lazyRoute('/gym', GymPanelPage),
    lazyRoute('/admin', AdminPage),
    lazyRoute('/fitness-test', FitnessTestPage),
    lazyRoute('/onboarding', OnboardingPage),
    lazyRoute('/generated/$id', GeneratedPlanPage),
    lazyRoute('/recipes', RecipesPage),
    recipeRoute,
  ]),
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
