import { ChevronLeft, ChevronRight, PackageSearch, SlidersHorizontal, X } from 'lucide-react'
import { useCallback, useState } from 'react'
import type { SortOrder } from '../../api/types'
import { Alert } from '../../components/Alert'
import { Button } from '../../components/Button'
import { Drawer } from '../../components/Drawer'
import { Spinner } from '../../components/Spinner'
import { FilterPanel } from './FilterPanel'
import { vehicleTitle } from './format'
import { PurchasePanel } from './PurchasePanel'
import { useVehicle, useVehicleSearch } from './queries'
import { PAGE_SIZE, useInventoryFilters, useTextDrafts } from './useInventoryFilters'
import { VehicleDetails } from './VehicleDetails'
import { ROW_GRID, VehicleRow } from './VehicleRow'

const SORT_OPTIONS: { value: SortOrder; label: string }[] = [
  { value: 'newest', label: 'Newest first' },
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'price_desc', label: 'Price: high to low' },
  { value: 'year_desc', label: 'Year: newest' },
  { value: 'year_asc', label: 'Year: oldest' },
  { value: 'make_asc', label: 'Make: A–Z' },
]

function EmptyState({ filtered, onClear }: { filtered: boolean; onClear: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
        <PackageSearch aria-hidden className="size-6" />
      </span>
      <p className="text-sm font-semibold text-slate-900">
        {filtered ? 'No vehicles match your filters' : 'No vehicles in inventory yet'}
      </p>
      <p className="max-w-xs text-sm text-slate-500">
        {filtered ? 'Try widening the price range or removing a filter.' : 'Vehicles added by staff will appear here.'}
      </p>
      {filtered && (
        <Button variant="secondary" size="sm" onClick={onClear}>
          Clear filters
        </Button>
      )}
    </div>
  )
}

function VehicleDrawer({ id, onClose }: { id: number; onClose: () => void }) {
  const { data: vehicle, isError, error } = useVehicle(id)
  if (isError) {
    return (
      <Drawer title="Vehicle details" onClose={onClose}>
        <div className="p-6">
          <Alert>{error.message}</Alert>
        </div>
      </Drawer>
    )
  }
  if (!vehicle) {
    return (
      <Drawer title="Vehicle details" onClose={onClose}>
        <div className="flex justify-center p-10 text-slate-400">
          <Spinner className="size-6" />
        </div>
      </Drawer>
    )
  }
  return (
    <Drawer
      title={vehicleTitle(vehicle)}
      subtitle={[vehicle.trim, vehicle.year].filter(Boolean).join(' · ')}
      onClose={onClose}
      footer={<PurchasePanel key={vehicle.id} vehicle={vehicle} />}
    >
      <VehicleDetails vehicle={vehicle} />
    </Drawer>
  )
}

export function InventoryPage() {
  const { filters, query, update, clear, activeCount, selectedId, select } = useInventoryFilters()
  const { data, isPending, isError, error, refetch, isFetching } = useVehicleSearch(query)
  const { drafts, change: changeDrafts, reset: resetDrafts } = useTextDrafts(filters, update)
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false)

  const clearAll = useCallback(() => {
    resetDrafts()
    clear()
  }, [clear, resetDrafts])
  const closeDrawer = useCallback(() => select(null), [select])

  const total = data?.total ?? 0
  const firstShown = total === 0 ? 0 : query.offset! + 1
  const lastShown = Math.min(query.offset! + PAGE_SIZE, total)
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const panel = (
    <FilterPanel
      filters={filters}
      drafts={drafts}
      onDraftChange={changeDrafts}
      counts={data?.counts}
      activeCount={activeCount}
      onChange={update}
      onClear={clearAll}
    />
  )

  return (
    <div className="mx-auto max-w-[1440px] p-4 sm:p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-slate-900">Inventory</h1>
        <p className="mt-1 text-sm text-slate-500">Browse vehicles on the lot and check live availability.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="hidden lg:block">{panel}</aside>

        <section className="min-w-0 rounded-lg border border-slate-200 bg-white">
          <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-4 py-3 sm:px-5">
            <h2 className="text-base font-semibold text-slate-900">
              Vehicles <span className="font-normal text-slate-500 tabular-nums">({total})</span>
            </h2>
            {isFetching && !isPending && <Spinner className="text-slate-400" />}
            <div className="ml-auto flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                className="lg:hidden"
                icon={<SlidersHorizontal aria-hidden className="size-3.5" />}
                onClick={() => setMobileFiltersOpen(true)}
              >
                Filters{activeCount ? ` (${activeCount})` : ''}
              </Button>
              <label htmlFor="sort" className="hidden text-sm text-slate-500 sm:block">
                Sort by
              </label>
              <select
                id="sort"
                aria-label="Sort by"
                value={filters.sort}
                onChange={(e) => update({ sort: e.target.value as SortOrder })}
                className="h-8 rounded-md border border-slate-300 bg-white px-2 pr-7 text-sm text-slate-700 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none"
              >
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div
            aria-hidden
            className={`hidden border-b border-slate-200 bg-slate-50/60 px-5 py-2.5 text-xs font-medium text-slate-500 ${ROW_GRID}`}
          >
            <span>Vehicle</span>
            <span>Year</span>
            <span>Availability</span>
            <span className="text-right">Price</span>
            <span className="w-[118px]" />
          </div>

          {isPending ? (
            <div role="status" className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
              <Spinner /> Loading vehicles…
            </div>
          ) : isError ? (
            <div className="space-y-3 p-6">
              <Alert>{error.message}</Alert>
              <Button variant="secondary" size="sm" onClick={() => refetch()}>
                Retry
              </Button>
            </div>
          ) : data.items.length === 0 ? (
            <EmptyState filtered={activeCount > 0} onClear={clearAll} />
          ) : (
            <ul aria-label="Vehicles" className="divide-y divide-slate-200">
              {data.items.map((vehicle) => (
                <VehicleRow key={vehicle.id} vehicle={vehicle} onView={() => select(vehicle.id)} />
              ))}
            </ul>
          )}

          {total > 0 && (
            <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-sm text-slate-500 sm:px-5">
              <span className="tabular-nums">
                Showing {firstShown}–{lastShown} of {total}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  aria-label="Previous page"
                  disabled={filters.page <= 1}
                  onClick={() => update({ page: filters.page - 1 })}
                  className="rounded-md p-1.5 hover:bg-slate-100 disabled:text-slate-300 disabled:hover:bg-transparent"
                >
                  <ChevronLeft className="size-4" />
                </button>
                <span className="px-2 tabular-nums">
                  {filters.page} / {pageCount}
                </span>
                <button
                  type="button"
                  aria-label="Next page"
                  disabled={filters.page >= pageCount}
                  onClick={() => update({ page: filters.page + 1 })}
                  className="rounded-md p-1.5 hover:bg-slate-100 disabled:text-slate-300 disabled:hover:bg-transparent"
                >
                  <ChevronRight className="size-4" />
                </button>
              </div>
            </div>
          )}
        </section>
      </div>

      {mobileFiltersOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div aria-hidden className="absolute inset-0 bg-slate-900/40" onClick={() => setMobileFiltersOpen(false)} />
          <div className="relative h-full w-full max-w-sm overflow-y-auto bg-canvas p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-900">Filters</p>
              <button
                type="button"
                aria-label="Close filters"
                onClick={() => setMobileFiltersOpen(false)}
                className="rounded-md p-1.5 text-slate-500 hover:bg-slate-200"
              >
                <X className="size-5" />
              </button>
            </div>
            {panel}
          </div>
        </div>
      )}

      {selectedId !== null && <VehicleDrawer id={selectedId} onClose={closeDrawer} />}
    </div>
  )
}
