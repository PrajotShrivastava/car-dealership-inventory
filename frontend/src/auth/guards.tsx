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

export function GuestOnly() {
  const { status } = useAuth()
  const location = useLocation()
  if (status === 'loading') return <FullPageSpinner />
  if (status === 'authenticated') return <Navigate to={postAuthTarget(location)} replace />
  return <Outlet />
}
