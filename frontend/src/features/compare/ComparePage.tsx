import { useQueries } from '@tanstack/react-query'
import { ArrowLeft, Check, GitCompareArrows, Minus, X } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router'
import type { Vehicle } from '../../api/types'
import { vehiclesApi } from '../../api/vehicles'
import { cn } from '../../components/cn'
import { Spinner } from '../../components/Spinner'
import { APP_INVENTORY } from '../../paths'
import { CONDITION_LABELS, formatMileage, formatPrice, titleCase, vehicleTitle } from '../inventory/format'
import { vehicleKeys } from '../inventory/queries'
import { StockBadge } from '../inventory/StockBadge'
import { VehicleThumb } from '../inventory/VehicleThumb'
import { compareStore, MAX_COMPARE, parseIds, useCompareSelection } from './compareStore'

type Best = 'lowest' | 'highest'

/** Ids of the vehicles holding the best value, or none when they're all the same (or only one has a value). */
function bestOf(vehicles: Vehicle[], value: (vehicle: Vehicle) => number | null, best: Best): Set<number> {
  const known = vehicles.flatMap((vehicle) => {
    const v = value(vehicle)
    return v === null ? [] : [{ id: vehicle.id, v }]
  })
  if (known.length < 2) return new Set()
  const target = best === 'lowest' ? Math.min(...known.map((k) => k.v)) : Math.max(...known.map((k) => k.v))
  const winners = known.filter((k) => k.v === target)
  return winners.length === known.length ? new Set() : new Set(winners.map((k) => k.id))
}

function BestTag({ children }: { children: ReactNode }) {
  return (
    <span className="ml-2 inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-600/20 ring-inset dark:bg-emerald-400/10 dark:text-emerald-300 dark:ring-emerald-400/25">
      {children}
    </span>
  )
}

interface Row {
  label: string
  cell: (vehicle: Vehicle) => ReactNode
}

export function ComparePage() {
  const [params, setParams] = useSearchParams()
  const stored = useCompareSelection()
  const fromUrl = parseIds(params.get('ids'))
  const ids = params.has('ids') ? fromUrl : stored

  // Opening a shared link makes it the browser's selection, so the inventory bar matches.
  const idsKey = fromUrl.join(',')
  useEffect(() => {
    if (idsKey) compareStore.replace(idsKey.split(',').map(Number))
  }, [idsKey])

  const results = useQueries({
    queries: ids.map((id) => ({ queryKey: vehicleKeys.detail(id), queryFn: () => vehiclesApi.get(id), retry: false })),
  })

  const remove = (id: number) => {
    compareStore.remove(id)
    const next = ids.filter((other) => other !== id)
    setParams(next.length ? { ids: next.join(',') } : {}, { replace: true })
  }

  if (ids.length < 2) {
    return (
      <div className="mx-auto max-w-3xl p-4 sm:p-6 lg:py-8">
        <div className="flex flex-col items-center gap-3 rounded-lg border border-slate-200 bg-white px-6 py-16 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
            <GitCompareArrows aria-hidden className="size-6" />
          </span>
          <h1 className="text-base font-semibold text-slate-900">Pick at least two vehicles to compare</h1>
          <p className="max-w-sm text-sm text-slate-500">
            Choose <span className="font-medium">Compare</span> on up to {MAX_COMPARE} vehicles in the inventory, then open the comparison.
          </p>
          <Link to={APP_INVENTORY} className="text-sm font-medium text-brand-600 hover:text-brand-700">
            Browse vehicles
          </Link>
        </div>
      </div>
    )
  }

  const loading = results.some((result) => result.isPending)
  const vehicles = results.flatMap((result) => (result.data ? [result.data] : []))
  const cheapest = bestOf(vehicles, (v) => Number(v.price), 'lowest')
  const leastDriven = bestOf(vehicles, (v) => v.mileage, 'lowest')
  const newest = bestOf(vehicles, (v) => v.year, 'highest')

  // Every feature any of them lists, in the order first seen.
  const features: string[] = []
  for (const feature of vehicles.flatMap((v) => v.features)) {
    if (!features.some((f) => f.toLowerCase() === feature.toLowerCase())) features.push(feature)
  }

  const rows: Row[] = [
    {
      label: 'Price',
      cell: (v) => (
        <>
          <span className="font-semibold tabular-nums">{formatPrice(v.price)}</span>
          {cheapest.has(v.id) && <BestTag>Lowest price</BestTag>}
        </>
      ),
    },
    { label: 'Condition', cell: (v) => CONDITION_LABELS[v.condition] },
    {
      label: 'Mileage',
      cell: (v) => (
        <>
          <span className="tabular-nums">{v.mileage != null ? formatMileage(v.mileage) : '—'}</span>
          {leastDriven.has(v.id) && <BestTag>Lowest mileage</BestTag>}
        </>
      ),
    },
    {
      label: 'Year',
      cell: (v) => (
        <>
          <span className="tabular-nums">{v.year}</span>
          {newest.has(v.id) && <BestTag>Newest</BestTag>}
        </>
      ),
    },
    { label: 'Category', cell: (v) => titleCase(v.category) },
    { label: 'Fuel', cell: (v) => titleCase(v.fuel_type) },
    { label: 'Transmission', cell: (v) => titleCase(v.transmission) },
    { label: 'Colour', cell: (v) => v.colour ?? '—' },
    { label: 'Availability', cell: (v) => <StockBadge quantity={v.quantity} /> },
  ]

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6 lg:py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link to={APP_INVENTORY} className="mb-2 inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700">
            <ArrowLeft aria-hidden className="size-4" />
            Back to vehicles
          </Link>
          <h1 className="text-xl font-semibold text-slate-900">Compare vehicles</h1>
          <p className="mt-1 text-sm text-canvas-muted">Side by side, with the best price, mileage and year marked.</p>
        </div>
        {loading && <Spinner className="text-slate-400" />}
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table aria-label="Vehicle comparison" className="w-full min-w-[40rem] table-fixed text-left text-sm">
          <colgroup>
            <col className="w-36" />
            {ids.map((id) => (
              <col key={id} />
            ))}
          </colgroup>
          <thead>
            <tr className="border-b border-slate-200 align-top">
              <th scope="col" className="sticky left-0 bg-white px-4 py-4">
                <span className="sr-only">Detail</span>
              </th>
              {ids.map((id, index) => {
                const result = results[index]
                const vehicle = result?.data
                const name = vehicle ? vehicleTitle(vehicle) : `Vehicle #${id}`
                return (
                  <th key={id} scope="col" className="px-4 py-4 font-normal">
                    <div className="flex items-start justify-between gap-2">
                      {vehicle ? (
                        <VehicleThumb category={vehicle.category} photo={vehicle.photos[0]} alt={`${vehicle.year} ${name}`} />
                      ) : (
                        <span className="flex h-16 w-24 items-center justify-center rounded-md bg-slate-100 text-slate-400">
                          {result?.isPending ? <Spinner /> : <Minus aria-hidden className="size-5" />}
                        </span>
                      )}
                      <button
                        type="button"
                        aria-label={`Remove ${name} from comparison`}
                        onClick={() => remove(id)}
                        className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                      >
                        <X aria-hidden className="size-4" />
                      </button>
                    </div>
                    {vehicle ? (
                      <>
                        <p className="mt-3 font-semibold text-slate-900">{name}</p>
                        <p className="text-xs text-slate-500">{[vehicle.trim, vehicle.year].filter(Boolean).join(' · ')}</p>
                        <Link
                          to={`${APP_INVENTORY}?vehicle=${vehicle.id}`}
                          className="mt-2 inline-block text-xs font-medium text-brand-600 hover:text-brand-700"
                        >
                          View details<span className="sr-only"> of {name}</span>
                        </Link>
                      </>
                    ) : result?.isError ? (
                      <p className="mt-3 text-sm text-slate-500">No longer available</p>
                    ) : null}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => (
              <tr key={row.label}>
                <th scope="row" className="sticky left-0 bg-white px-4 py-3 text-xs font-medium text-slate-500">
                  {row.label}
                </th>
                {ids.map((id, index) => {
                  const vehicle = results[index]?.data
                  return (
                    <td key={id} className="px-4 py-3 text-slate-900">
                      {vehicle ? row.cell(vehicle) : '—'}
                    </td>
                  )
                })}
              </tr>
            ))}
            {features.length > 0 && (
              <tr className="bg-slate-50/60">
                <th scope="rowgroup" colSpan={ids.length + 1} className="px-4 py-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">
                  Features
                </th>
              </tr>
            )}
            {features.map((feature) => (
              <tr key={feature}>
                <th scope="row" className="sticky left-0 bg-white px-4 py-3 text-xs font-medium text-slate-500">
                  {feature}
                </th>
                {ids.map((id, index) => {
                  const vehicle = results[index]?.data
                  const has = vehicle?.features.some((f) => f.toLowerCase() === feature.toLowerCase())
                  return (
                    <td key={id} className={cn('px-4 py-3', has ? 'text-emerald-600' : 'text-slate-300')}>
                      <span role="img" aria-label={has ? 'Included' : 'Not listed'}>
                        {has ? <Check aria-hidden className="size-4" /> : <Minus aria-hidden className="size-4" />}
                      </span>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
