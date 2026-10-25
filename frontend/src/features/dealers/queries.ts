import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError } from '../../api/client'
import { dealersApi } from '../../api/dealers'
import type { DealerApplication } from '../../api/types'

export const dealerKeys = {
  all: ['dealer-applications'] as const,
  pending: ['dealer-applications', 'pending'] as const,
  mine: ['dealer-applications', 'mine'] as const,
}

const isPending = (query: { state: { data?: DealerApplication | null } }) => query.state.data?.status === 'pending'

/**
 * The signed-in user's own application, or null if they never applied. While it is pending
 * it is re-checked every minute and when the user returns to the tab, so an approval shows
 * up without signing out.
 */
export function useMyApplication(enabled: boolean) {
  return useQuery({
    queryKey: dealerKeys.mine,
    enabled,
    refetchInterval: (query) => (isPending(query) ? 60_000 : false),
    refetchOnWindowFocus: isPending,
    queryFn: async () => {
      try {
        return await dealersApi.mine()
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) return null
        throw error
      }
    },
  })
}

export function usePendingApplications(enabled = true) {
  return useQuery({ queryKey: dealerKeys.pending, queryFn: () => dealersApi.list('pending'), enabled })
}

export function useReviewApplication() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, decision, note }: { id: number; decision: 'approve' | 'reject'; note?: string }) =>
      decision === 'approve' ? dealersApi.approve(id) : dealersApi.reject(id, note),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: dealerKeys.all }),
  })
}
