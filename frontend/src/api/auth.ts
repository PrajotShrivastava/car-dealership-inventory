import { apiFetch } from './client'
import type { TokenResponse, User } from './types'

export const authApi = {
  register: (body: { email: string; password: string; full_name: string }) =>
    apiFetch<User>('/auth/register', { method: 'POST', body }),
  login: (body: { email: string; password: string }) =>
    apiFetch<TokenResponse>('/auth/login', { method: 'POST', body }),
  me: () => apiFetch<User>('/auth/me'),
  /** A new access token from the httpOnly refresh-token cookie (which is rotated). */
  refresh: () => apiFetch<TokenResponse>('/auth/refresh', { method: 'POST' }),
  /** Ends this browser's session on the server and clears the cookie. */
  logout: () => apiFetch<void>('/auth/logout', { method: 'POST' }),
  /** Ends every session of the account, including access tokens already issued. */
  logoutAll: () => apiFetch<void>('/auth/logout-all', { method: 'POST' }),
}
