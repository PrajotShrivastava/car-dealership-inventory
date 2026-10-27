import { useInfiniteQuery } from '@tanstack/react-query'
import { accountApi } from '../../api/account'
import type { Page } from '../../api/types'
import { saveFile } from '../../download'

export const ACCOUNT_PAGE_SIZE = 10

function nextOffset<T>(last: Page<T>, pages: Page<T>[]) {
  const loaded = pages.reduce((sum, page) => sum + page.items.length, 0)
  return loaded < last.total ? loaded : undefined
}

export function usePurchases() {
  return useInfiniteQuery({
    queryKey: ['account', 'purchases'],
    queryFn: ({ pageParam, signal }) => accountApi.purchases({ limit: ACCOUNT_PAGE_SIZE, offset: pageParam }, signal),
    initialPageParam: 0,
    getNextPageParam: nextOffset,
  })
}

export function useEnquiries() {
  return useInfiniteQuery({
    queryKey: ['account', 'enquiries'],
    queryFn: ({ pageParam, signal }) => accountApi.enquiries({ limit: ACCOUNT_PAGE_SIZE, offset: pageParam }, signal),
    initialPageParam: 0,
    getNextPageParam: nextOffset,
  })
}

/** Fetches the PDF with the signed-in session and saves it as invoice-<id>.pdf. */
export async function downloadPurchaseInvoice(id: number, tz: string) {
  saveFile(await accountApi.invoice(id, tz), `invoice-${id}.pdf`)
}
