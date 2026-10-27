import { apiFetch } from './client'
import type { Sale, SaleCreate, SaleList, SaleQuery } from './types'

export const salesApi = {
  list: (query: SaleQuery, signal?: AbortSignal) => apiFetch<SaleList>('/sales', { query: { ...query }, signal }),
  get: (id: number) => apiFetch<Sale>(`/sales/${id}`),
  create: (body: SaleCreate) => apiFetch<Sale>('/sales', { method: 'POST', body }),
  invoice: (id: number, tz: string) =>
    apiFetch<Blob>(`/sales/${id}/invoice`, { query: { tz }, responseType: 'blob' }),
}
