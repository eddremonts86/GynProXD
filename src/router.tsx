import { createRootRoute, createRoute, createRouter, Link, Outlet } from '@tanstack/react-router'
import { TodayPage } from './routes/Today'
import { LibraryPage } from './routes/Library'
import { HistoryPage } from './routes/History'
import { SettingsPage } from './routes/Settings'

const rootRoute = createRootRoute({
  component: () => (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col">
      <main className="flex-1 px-4 pb-24 pt-6">
        <Outlet />
      </main>
      <nav className="fixed inset-x-0 bottom-0 border-t border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-md items-stretch justify-around py-2">
          {[
            ['/', 'Today'],
            ['/library', 'Library'],
            ['/history', 'History'],
            ['/settings', 'Settings'],
          ].map(([to, label]) => (
            <Link
              key={to}
              to={to}
              activeOptions={{ exact: to === '/' }}
              className="px-3 py-2 text-sm text-zinc-400 data-[status=active]:font-semibold data-[status=active]:text-accent"
            >
              {label}
            </Link>
          ))}
        </div>
      </nav>
    </div>
  ),
})

const todayRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: TodayPage })
const libraryRoute = createRoute({ getParentRoute: () => rootRoute, path: '/library', component: LibraryPage })
const historyRoute = createRoute({ getParentRoute: () => rootRoute, path: '/history', component: HistoryPage })
const settingsRoute = createRoute({ getParentRoute: () => rootRoute, path: '/settings', component: SettingsPage })

export const router = createRouter({
  routeTree: rootRoute.addChildren([todayRoute, libraryRoute, historyRoute, settingsRoute]),
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
