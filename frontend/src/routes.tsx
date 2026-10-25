import { createBrowserRouter, createMemoryRouter, Navigate, type RouteObject } from 'react-router'
import { GuestOnly, RequireAdmin, RequireAuth } from './auth/guards'
import { DealerApplicationsPage } from './features/dealers/DealerApplicationsPage'
import { InventoryPage } from './features/inventory/InventoryPage'
import { AppShell } from './layout/AppShell'
import { AboutPage } from './marketing/AboutPage'
import { HomePage } from './marketing/HomePage'
import { MarketingLayout } from './marketing/MarketingLayout'
import { PricingPage } from './marketing/PricingPage'
import { DealerRegisterPage } from './pages/DealerRegisterPage'
import { LoginPage } from './pages/LoginPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { RegisterPage } from './pages/RegisterPage'

/** Where users land after signing in or up. */
export const APP_HOME = '/app'

export const routes: RouteObject[] = [
  {
    // Public marketing site
    element: <MarketingLayout />,
    children: [
      { path: '/', element: <HomePage /> },
      { path: '/about', element: <AboutPage /> },
      { path: '/pricing', element: <PricingPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
  {
    element: <GuestOnly />,
    children: [
      { path: '/login', element: <LoginPage /> },
      { path: '/signup', element: <RegisterPage /> },
      { path: '/dealer/register', element: <DealerRegisterPage /> },
    ],
  },
  { path: '/register', element: <Navigate to="/signup" replace /> },
  {
    // The inventory application
    element: <RequireAuth />,
    children: [
      {
        element: <AppShell />,
        children: [
          { path: APP_HOME, element: <InventoryPage /> },
          {
            element: <RequireAdmin />,
            children: [{ path: `${APP_HOME}/dealer-applications`, element: <DealerApplicationsPage /> }],
          },
        ],
      },
    ],
  },
]

export type AppRouter = ReturnType<typeof createBrowserRouter>

export function createAppRouter(kind: 'browser' | 'memory' = 'browser', initialEntries?: string[]): AppRouter {
  return kind === 'memory' ? createMemoryRouter(routes, { initialEntries }) : createBrowserRouter(routes)
}
