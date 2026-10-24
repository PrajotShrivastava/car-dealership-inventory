import { apiFetch } from './client'
import type { ApplicationStatus, DealerApplication, DealerRegisterRequest, User } from './types'

export const dealersApi = {
  register: (body: DealerRegisterRequest) =>
    apiFetch<{ user: User; application: DealerApplication }>('/auth/register-dealer', { method: 'POST', body }),
  mine: () => apiFetch<DealerApplication>('/dealer-applications/me'),
  list: (status?: ApplicationStatus) =>
    apiFetch<DealerApplication[]>('/dealer-applications', { query: { status } }),
  approve: (id: number) => apiFetch<DealerApplication>(`/dealer-applications/${id}/approve`, { method: 'POST' }),
  reject: (id: number, note?: string) =>
    apiFetch<DealerApplication>(`/dealer-applications/${id}/reject`, {
      method: 'POST',
      body: { note: note?.trim() || null },
    }),
}
