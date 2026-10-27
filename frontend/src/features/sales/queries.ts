import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { salesApi } from '../../api/sales'
import type { SaleQuery } from '../../api/types'
import { vehiclesApi } from '../../api/vehicles'

export function useSales(query: SaleQuery) {
  return useQuery({
    queryKey: ['sales', 'list', query],
    queryFn: ({ signal }) => salesApi.list(query, signal),
    placeholderData: keepPreviousData,
  })
}

export function useSale(id: number | null) {
  return useQuery({ queryKey: ['sales', 'detail', id], queryFn: () => salesApi.get(id!), enabled: id !== null })
}

/** The dealer's own vehicles for pickers (the API only returns their listings). */
export function useMyVehicles(inStockOnly = false) {
  const query = { limit: 100, sort: 'make_asc' as const, availability: inStockOnly ? ('in_stock' as const) : ('all' as const) }
  return useQuery({
    queryKey: ['vehicles', 'list', query],
    queryFn: ({ signal }) => vehiclesApi.search(query, signal),
  })
}

/** A sale changes stock, lead status and the dashboard, so all of them refresh. */
export function useRecordSale() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: salesApi.create,
    onSuccess: () =>
      Promise.all(
        [['sales'], ['vehicles'], ['dashboard'], ['leads']].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      ),
  })
}

/** Fetches the PDF with the signed-in session and saves it as invoice-<id>.pdf. */
export async function downloadInvoice(id: number, tz: string) {
  const blob = await salesApi.invoice(id, tz)
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `invoice-${id}.pdf`
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
