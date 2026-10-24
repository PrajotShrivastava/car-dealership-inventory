import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import { CATEGORIES, type Availability, type Category, type SortOrder, type VehicleQuery } from '../../api/types'

export const PAGE_SIZE = 20

const SORTS: SortOrder[] = ['newest', 'price_asc', 'price_desc', 'year_desc', 'year_asc', 'make_asc']
const AVAILABILITY: Availability[] = ['all', 'in_stock', 'out_of_stock']

export interface Filters {
  q: string
  category: Category | ''
  min_price: string
  max_price: string
  availability: Availability
  sort: SortOrder
  page: number
}

const FILTER_KEYS = ['q', 'category', 'min_price', 'max_price', 'availability'] as const

function oneOf<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback
}

/** Filters live in the URL so views are shareable and survive reloads. */
export function useInventoryFilters() {
  const [params, setParams] = useSearchParams()

  const filters: Filters = useMemo(
    () => ({
      q: params.get('q') ?? '',
      category: oneOf(params.get('category'), CATEGORIES, '' as never) as Category | '',
      min_price: params.get('min_price') ?? '',
      max_price: params.get('max_price') ?? '',
      availability: oneOf(params.get('availability'), AVAILABILITY, 'all'),
      sort: oneOf(params.get('sort'), SORTS, 'newest'),
      page: Math.max(1, Number(params.get('page')) || 1),
    }),
    [params],
  )

  const update = useCallback(
    (changes: Partial<Filters>) => {
      setParams(
        (current) => {
          const next = new URLSearchParams(current)
          for (const [key, value] of Object.entries(changes)) {
            const isDefault = value === '' || value === 'all' || value === 'newest' || value === 1
            if (isDefault) next.delete(key)
            else next.set(key, String(value))
          }
          // Any filter/sort change returns to the first page.
          if (!('page' in changes)) next.delete('page')
          return next
        },
        { replace: true },
      )
    },
    [setParams],
  )

  const clear = useCallback(() => {
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        for (const key of [...FILTER_KEYS, 'page']) next.delete(key)
        return next
      },
      { replace: true },
    )
  }, [setParams])

  const selectedId = Number(params.get('vehicle')) || null
  const select = useCallback(
    (id: number | null) =>
      setParams((current) => {
        const next = new URLSearchParams(current)
        if (id === null) next.delete('vehicle')
        else next.set('vehicle', String(id))
        return next
      }),
    [setParams],
  )

  const activeCount = FILTER_KEYS.filter((key) => {
    const value = filters[key]
    return value !== '' && value !== 'all'
  }).length

  const query: VehicleQuery = {
    q: filters.q || undefined,
    category: filters.category || undefined,
    min_price: filters.min_price || undefined,
    max_price: filters.max_price || undefined,
    availability: filters.availability,
    sort: filters.sort,
    limit: PAGE_SIZE,
    offset: (filters.page - 1) * PAGE_SIZE,
  }

  return { filters, query, update, clear, activeCount, selectedId, select }
}

export type TextDrafts = Pick<Filters, 'q' | 'min_price' | 'max_price'>

/**
 * Free-text inputs keep an immediate draft and push debounced values to the URL,
 * so typing does not fire a request per keystroke.
 */
export function useTextDrafts(filters: Filters, update: (changes: Partial<Filters>) => void) {
  const [drafts, setDrafts] = useState<TextDrafts>(() => ({
    q: filters.q,
    min_price: filters.min_price,
    max_price: filters.max_price,
  }))
  const debounced = useDebouncedValue(drafts)

  useEffect(() => {
    const changes: Partial<Filters> = {}
    if (debounced.q.trim() !== filters.q) changes.q = debounced.q.trim()
    if (debounced.min_price !== filters.min_price) changes.min_price = debounced.min_price
    if (debounced.max_price !== filters.max_price) changes.max_price = debounced.max_price
    if (Object.keys(changes).length) update(changes)
    // Only react to settled drafts; URL changes are handled by reset().
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced])

  const change = useCallback((next: Partial<TextDrafts>) => setDrafts((d) => ({ ...d, ...next })), [])
  const reset = useCallback(() => setDrafts({ q: '', min_price: '', max_price: '' }), [])
  return { drafts, change, reset }
}
