import { createBrowserRouter, createMemoryRouter, type RouteObject } from 'react-router'
import { GuestOnly, RequireAuth } from './auth/guards'
import { AppShell } from './layout/AppShell'
import { InventoryPage } from './pages/InventoryPage'
import { LoginPage } from './pages/LoginPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { RegisterPage } from './pages/RegisterPage'

export const routes: RouteObject[] = [
  {
    element: <GuestOnly />,
    children: [
      { path: '/login', element: <LoginPage /> },
      { path: '/register', element: <RegisterPage /> },
    ],
  },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppShell />,
        children: [{ path: '/', element: <InventoryPage /> }],
      },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
]

export type AppRouter = ReturnType<typeof createBrowserRouter>

export function createAppRouter(kind: 'browser' | 'memory' = 'browser', initialEntries?: string[]): AppRouter {
  return kind === 'memory' ? createMemoryRouter(routes, { initialEntries }) : createBrowserRouter(routes)
}
