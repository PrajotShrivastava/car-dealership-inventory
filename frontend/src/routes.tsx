import { createBrowserRouter, createMemoryRouter, Navigate, type RouteObject } from 'react-router'
import { AppHome, GuestOnly, RequireAdmin, RequireAuth, RequireDealer } from './auth/guards'
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
import { APP_DASHBOARD, APP_HOME, APP_INVENTORY, APP_LEADS, APP_SALES } from './paths'
import { RegisterPage } from './pages/RegisterPage'


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
          { path: APP_HOME, element: <AppHome /> },
          { path: APP_INVENTORY, element: <InventoryPage /> },
          {
            element: <RequireDealer />,
            children: [
              // Dealer-only pages load on demand, keeping them out of everyone else's bundle.
              {
                path: APP_DASHBOARD,
                lazy: () => import('./features/dashboard/DashboardPage').then((m) => ({ Component: m.DashboardPage })),
              },
              { path: APP_SALES, lazy: () => import('./features/sales/SalesPage').then((m) => ({ Component: m.SalesPage })) },
              { path: APP_LEADS, lazy: () => import('./features/leads/LeadsPage').then((m) => ({ Component: m.LeadsPage })) },
            ],
          },
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
