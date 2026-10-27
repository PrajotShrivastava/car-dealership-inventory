import { Navigate, Outlet, useLocation } from 'react-router'
import { APP_DASHBOARD, APP_INVENTORY } from '../paths'
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
  return isAdmin ? <Outlet /> : <Navigate to={APP_INVENTORY} replace />
}

/** Dealer-only pages (the sales dashboard): everyone else is sent to the inventory. */
export function RequireDealer() {
  const { isDealer } = useAuth()
  return isDealer ? <Outlet /> : <Navigate to={APP_INVENTORY} replace />
}

/** The customer's own purchases and enquiries: dealers and admins have none. */
export function RequireCustomer() {
  const { user } = useAuth()
  return user?.role === 'customer' ? <Outlet /> : <Navigate to={APP_INVENTORY} replace />
}

/** /app itself: dealers start on their dashboard, everyone else on the inventory. The query
 * string is kept, so older links such as /app?category=suv still work. */
export function AppHome() {
  const { isDealer } = useAuth()
  const { search } = useLocation()
  return <Navigate to={{ pathname: isDealer ? APP_DASHBOARD : APP_INVENTORY, search }} replace />
}

export function GuestOnly() {
  const { status } = useAuth()
  const location = useLocation()
  if (status === 'loading') return <FullPageSpinner />
  if (status === 'authenticated') return <Navigate to={postAuthTarget(location)} replace />
  return <Outlet />
}
