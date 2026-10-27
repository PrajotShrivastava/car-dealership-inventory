import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { leadsApi } from '../../api/leads'
import type { Lead, LeadFields, LeadQuery } from '../../api/types'

export function useLeads(query: LeadQuery) {
  return useQuery({
    queryKey: ['leads', 'list', query],
    queryFn: ({ signal }) => leadsApi.list(query, signal),
    placeholderData: keepPreviousData,
  })
}

export function useLead(id: number | null) {
  return useQuery({ queryKey: ['leads', 'detail', id], queryFn: () => leadsApi.get(id!), enabled: id !== null })
}

/** Leads feed the dashboard's follow-up reminders, so both refresh after a change. */
function useRefresh() {
  const queryClient = useQueryClient()
  return (lead: Lead) => {
    queryClient.setQueryData(['leads', 'detail', lead.id], lead)
    return Promise.all([
      queryClient.invalidateQueries({ queryKey: ['leads', 'list'] }),
      queryClient.invalidateQueries({ queryKey: ['leads', 'picker'] }),
      queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
    ])
  }
}

export function useCreateLead() {
  const refresh = useRefresh()
  return useMutation({ mutationFn: leadsApi.create, onSuccess: refresh })
}

export function useUpdateLead() {
  const refresh = useRefresh()
  return useMutation({
    mutationFn: ({ id, changes }: { id: number; changes: Partial<LeadFields> }) => leadsApi.update(id, changes),
    onSuccess: refresh,
  })
}
