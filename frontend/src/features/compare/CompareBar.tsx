import { useQueries } from '@tanstack/react-query'
import { GitCompareArrows, X } from 'lucide-react'
import { Link } from 'react-router'
import { vehiclesApi } from '../../api/vehicles'
import { vehicleKeys } from '../inventory/queries'
import { vehicleTitle } from '../inventory/format'
import { compareHref, compareStore, MAX_COMPARE, useCompareSelection } from './compareStore'

/** Sticks to the bottom of the inventory (the scrolling main area, so the sidebar stays
 * clear) while vehicles are picked for comparison. */
export function CompareBar() {
  const selection = useCompareSelection()
  const vehicles = useQueries({
    queries: selection.map((id) => ({ queryKey: vehicleKeys.detail(id), queryFn: () => vehiclesApi.get(id), retry: false })),
  })
  if (selection.length === 0) return null
  const ready = selection.length >= 2

  return (
    <section
      aria-label="Comparison"
      className="sticky bottom-4 z-30 mt-6 rounded-lg border border-slate-200 bg-white/95 px-4 py-3 shadow-lg backdrop-blur sm:px-5"
    >
      <div className="flex flex-wrap items-center gap-3">
        <ul aria-label="Vehicles to compare" className="flex min-w-0 flex-1 flex-wrap gap-2">
          {selection.map((id, index) => {
            const vehicle = vehicles[index]?.data
            const name = vehicle ? vehicleTitle(vehicle) : `Vehicle #${id}`
            return (
              <li
                key={id}
                className="inline-flex max-w-56 items-center gap-1 rounded-full border border-slate-200 bg-slate-50 py-1 pr-1 pl-3 text-xs font-medium text-slate-700"
              >
                <span className="truncate">{name}</span>
                <button
                  type="button"
                  aria-label={`Remove ${name} from comparison`}
                  onClick={() => compareStore.remove(id)}
                  className="rounded-full p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                >
                  <X aria-hidden className="size-3.5" />
                </button>
              </li>
            )
          })}
        </ul>
        <span className="text-xs text-slate-500 tabular-nums">
          {ready ? `${selection.length} of ${MAX_COMPARE}` : 'Pick one more to compare'}
        </span>
        <button
          type="button"
          onClick={() => compareStore.clear()}
          className="text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          Clear
        </button>
        {ready ? (
          <Link
            to={compareHref(selection)}
            className="inline-flex h-10 items-center gap-2 rounded-md bg-brand-600 px-4 text-sm font-medium text-on-brand hover:bg-brand-700"
          >
            <GitCompareArrows aria-hidden className="size-4" />
            Compare
          </Link>
        ) : (
          <span
            aria-disabled="true"
            className="inline-flex h-10 cursor-not-allowed items-center gap-2 rounded-md bg-brand-600/50 px-4 text-sm font-medium text-on-brand"
          >
            <GitCompareArrows aria-hidden className="size-4" />
            Compare
          </span>
        )}
      </div>
    </section>
  )
}
