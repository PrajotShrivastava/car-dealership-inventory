import { apiFetch } from './client'
import type { TokenResponse, User } from './types'

export const authApi = {
  register: (body: { email: string; password: string; full_name: string }) =>
    apiFetch<User>('/auth/register', { method: 'POST', body }),
  login: (body: { email: string; password: string }) =>
    apiFetch<TokenResponse>('/auth/login', { method: 'POST', body }),
  me: () => apiFetch<User>('/auth/me'),
}
