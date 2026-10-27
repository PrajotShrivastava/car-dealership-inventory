import { apiFetch } from './client'
import type { Lead, LeadFields, LeadList, LeadQuery } from './types'

export const leadsApi = {
  list: (query: LeadQuery, signal?: AbortSignal) => apiFetch<LeadList>('/leads', { query: { ...query }, signal }),
  get: (id: number) => apiFetch<Lead>(`/leads/${id}`),
  create: (body: Partial<LeadFields> & { name: string }) => apiFetch<Lead>('/leads', { method: 'POST', body }),
  /** Only the fields sent change; null clears an optional field. */
  update: (id: number, body: Partial<LeadFields>) => apiFetch<Lead>(`/leads/${id}`, { method: 'PATCH', body }),
}
