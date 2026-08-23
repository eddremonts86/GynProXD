import * as React from 'react'
import { createRootRoute, createRoute, createRouter, Link, Outlet, useRouterState } from '@tanstack/react-router'
import { Home, CalendarRange, Library, History, Settings, WandSparkles, Dumbbell, ChartColumn } from 'lucide-react'
import { RouteFallback } from '@/components/route-skeleton'

const TodayPage = React.lazy(() => import('./routes/Today').then((m) => ({ default: m.TodayPage })))
const LibraryPage = React.lazy(() => import('./routes/Library').then((m) => ({ default: m.LibraryPage })))
const HistoryPage = React.lazy(() => import('./routes/History').then((m) => ({ default: m.HistoryPage })))
const SettingsPage = React.lazy(() => import('./routes/Settings').then((m) => ({ default: m.SettingsPage })))
const PlannerPage = React.lazy(() => import('./routes/Planner').then((m) => ({ default: m.PlannerPage })))
const OnboardingPage = React.lazy(() => import('./routes/Onboarding').then((m) => ({ default: m.OnboardingPage })))
const GeneratedPlanPage = React.lazy(() => import('./routes/GeneratedPlan').then((m) => ({ default: m.GeneratedPlanPage })))
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar'
import { Separator } from '@/components/ui/separator'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ThemeToggle } from '@/components/theme-toggle'

const navMain = [
  { title: 'Today', url: '/', icon: Home },
  { title: 'Onboarding', url: '/onboarding', icon: WandSparkles },
  { title: 'Planner', url: '/planner', icon: CalendarRange },
  { title: 'Library', url: '/library', icon: Library },
  { title: 'History', url: '/history', icon: History },
  { title: 'Settings', url: '/settings', icon: Settings },
]

const navSecondary = [
  { title: 'Generated', url: '/generated', icon: ChartColumn, disabled: true },
]

function AppSidebar() {
  const routerState = useRouterState()
  const pathname = routerState.location.pathname
  return (
    <Sidebar variant="inset" collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
            <Dumbbell className="h-4 w-4" />
          </div>
          <div className="grid flex-1 text-left text-sm leading-tight">
            <span className="font-display truncate text-base font-semibold tracking-tight">Forma</span>
            <span className="truncate text-xs tracking-widest text-muted-foreground uppercase">local training</span>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Training</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navMain.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton tooltip={item.title} isActive={pathname === item.url} render={<Link to={item.url} />}>
                    <item.icon />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>System</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navSecondary.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton tooltip={item.title} isActive={false} className="opacity-60">
                    <item.icon />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <div className="rounded-lg border bg-card p-3">
          <p className="font-display text-sm font-medium">Noir Warm · 3D</p>
          <p className="text-xs leading-4 text-muted-foreground">Hybrid calisthenics + gym. Offline.</p>
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}

const rootRoute = createRootRoute({
  component: () => (
    <TooltipProvider>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-4 md:px-6">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 h-4" />
            <div className="flex items-center gap-2 text-sm">
              <span className="hidden font-display text-base md:inline">Forma</span>
              <span className="hidden text-xs tracking-widest text-muted-foreground uppercase md:inline">· desktop-first · shadcn</span>
              <span className="text-xs tracking-widest text-muted-foreground uppercase md:hidden">Forma</span>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <span className="hidden rounded-full border bg-card px-2.5 py-1 text-xs font-medium tracking-wide text-muted-foreground md:inline">873 movements</span>
              <ThemeToggle />
            </div>
          </header>
          <div className="flex flex-1 flex-col bg-gradient-to-b from-background to-muted/20">
            <div className="mx-auto w-full max-w-7xl flex-1 p-4 pb-24 md:p-6 lg:p-8 md:pb-8">
              <Outlet />
            </div>
          </div>
          <nav className="fixed inset-x-0 bottom-0 z-10 flex border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 pb-[env(safe-area-inset-bottom)] md:hidden">
            <div className="flex w-full justify-around px-1 py-1">
              {navMain.slice(0, 5).map((item) => (
                <Link
                  key={item.title}
                  to={item.url}
                  className="flex flex-col items-center gap-1 rounded-md px-3 py-2 text-xs font-medium text-muted-foreground data-[status=active]:text-primary"
                >
                  <item.icon className="h-4 w-4" />
                  <span className="text-[10px]">{item.title}</span>
                </Link>
              ))}
            </div>
          </nav>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  ),
})

const todayRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: () => (
    <React.Suspense fallback={<RouteFallback />}>
      <TodayPage />
    </React.Suspense>
  ),
})
const plannerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/planner',
  component: () => (
    <React.Suspense fallback={<RouteFallback />}>
      <PlannerPage />
    </React.Suspense>
  ),
})
const libraryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/library',
  component: () => (
    <React.Suspense fallback={<RouteFallback />}>
      <LibraryPage />
    </React.Suspense>
  ),
})
const historyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/history',
  component: () => (
    <React.Suspense fallback={<RouteFallback />}>
      <HistoryPage />
    </React.Suspense>
  ),
})
const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings',
  component: () => (
    <React.Suspense fallback={<RouteFallback />}>
      <SettingsPage />
    </React.Suspense>
  ),
})
const onboardingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/onboarding',
  component: () => (
    <React.Suspense fallback={<RouteFallback />}>
      <OnboardingPage />
    </React.Suspense>
  ),
})
const generatedRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/generated/$id',
  component: () => (
    <React.Suspense fallback={<RouteFallback />}>
      <GeneratedPlanPage />
    </React.Suspense>
  ),
})

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
