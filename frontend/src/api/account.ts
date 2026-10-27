import { apiFetch } from './client'
import type { AccountEnquiry, AccountPurchase, Page } from './types'

interface PageQuery {
  limit?: number
  offset?: number
}

export const accountApi = {
  purchases: (query: PageQuery, signal?: AbortSignal) =>
    apiFetch<Page<AccountPurchase>>('/account/purchases', { query: { ...query }, signal }),
  invoice: (id: number, tz: string) =>
    apiFetch<Blob>(`/account/purchases/${id}/invoice`, { query: { tz }, responseType: 'blob' }),
  enquiries: (query: PageQuery, signal?: AbortSignal) =>
    apiFetch<Page<AccountEnquiry>>('/account/enquiries', { query: { ...query }, signal }),
}
