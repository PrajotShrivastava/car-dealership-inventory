import { Navigate, Outlet, useLocation } from 'react-router'
import { FullPageSpinner } from '../components/Spinner'
import { useAuth } from './AuthContext'
import { postAuthTarget } from './redirects'

export function RequireAuth() {
  const { status } = useAuth()
  const location = useLocation()
  if (status === 'loading') return <FullPageSpinner />
  if (status === 'anonymous') {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  }
  return <Outlet />
}

/** Admin-only pages: everyone else is sent back to the inventory. */
export function RequireAdmin() {
  const { isAdmin } = useAuth()
  return isAdmin ? <Outlet /> : <Navigate to="/app" replace />
}

export function GuestOnly() {
  const { status } = useAuth()
  const location = useLocation()
  if (status === 'loading') return <FullPageSpinner />
  if (status === 'authenticated') return <Navigate to={postAuthTarget(location)} replace />
  return <Outlet />
}
