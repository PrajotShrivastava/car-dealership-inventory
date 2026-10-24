import { createBrowserRouter, createMemoryRouter, Navigate, type RouteObject } from 'react-router'
import { GuestOnly, RequireAuth } from './auth/guards'
import { InventoryPage } from './features/inventory/InventoryPage'
import { AppShell } from './layout/AppShell'
import { HomePage } from './marketing/HomePage'
import { MarketingLayout } from './marketing/MarketingLayout'
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
      { path: '*', element: <NotFoundPage /> },
    ],
  },
  {
    element: <GuestOnly />,
    children: [
      { path: '/login', element: <LoginPage /> },
      { path: '/signup', element: <RegisterPage /> },
    ],
  },
  { path: '/register', element: <Navigate to="/signup" replace /> },
  {
    // The inventory application
    element: <RequireAuth />,
    children: [
      {
        element: <AppShell />,
        children: [{ path: APP_HOME, element: <InventoryPage /> }],
      },
    ],
  },
]

export type AppRouter = ReturnType<typeof createBrowserRouter>

export function createAppRouter(kind: 'browser' | 'memory' = 'browser', initialEntries?: string[]): AppRouter {
  return kind === 'memory' ? createMemoryRouter(routes, { initialEntries }) : createBrowserRouter(routes)
}
