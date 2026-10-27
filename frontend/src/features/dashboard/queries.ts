import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { dashboardApi } from '../../api/dashboard'
import type { DashboardRange } from '../../api/types'
import { viewerTimeZone } from '../../time'

export { viewerTimeZone } from '../../time'

export function useDashboard(months: DashboardRange) {
  const tz = viewerTimeZone()
  return useQuery({
    queryKey: ['dashboard', months, tz],
    queryFn: ({ signal }) => dashboardApi.get(months, tz, signal),
    // Keep the current figures on screen while another range loads.
    placeholderData: keepPreviousData,
  })
}
