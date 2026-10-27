import { apiFetch } from './client'
import type { Dashboard, DashboardRange } from './types'

export const dashboardApi = {
  /** `tz` is the viewer's IANA time zone, so "this month" is their calendar month. */
  get: (months: DashboardRange, tz: string, signal?: AbortSignal) =>
    apiFetch<Dashboard>('/dashboard', { query: { months, tz }, signal }),
}
