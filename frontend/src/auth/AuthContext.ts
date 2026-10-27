import { createContext, useContext } from 'react'
import type { DealerRegisterRequest, User } from '../api/types'

export type AuthStatus = 'loading' | 'authenticated' | 'anonymous'

export interface AuthContextValue {
  status: AuthStatus
  user: User | null
  /** Admin-only operations, such as reviewing dealer applications. */
  isAdmin: boolean
  /** Dealers: their own listings plus a sales dashboard. */
  isDealer: boolean
  /** Dealers and admins: add, edit, restock and delete vehicles and their photos. */
  canManageInventory: boolean
  login: (email: string, password: string) => Promise<void>
  register: (fullName: string, email: string, password: string) => Promise<void>
  /** Create a dealer account, then sign in. */
  registerDealer: (body: DealerRegisterRequest) => Promise<void>
  logout: () => void
  /** Re-reads the signed-in user from the API, e.g. after their role changed. */
  refreshUser: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>')
  return value
}
