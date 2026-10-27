import { ChevronLeft, ChevronRight, CircleDollarSign, Plus, Receipt, ShoppingCart, TrendingUp } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router'
import type { Sale, SaleChannel } from '../../api/types'
import { Alert } from '../../components/Alert'
import { Button } from '../../components/Button'
import { Spinner } from '../../components/Spinner'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import { viewerTimeZone } from '../../time'
import { KpiCard } from '../dashboard/KpiCard'
import { formatPrice, vehicleTitle } from '../inventory/format'
import { formatSaleDate, moneyOrDash, profitCoverage } from './format'
import { downloadInvoice, useMyVehicles, useSales } from './queries'
import { RecordSaleDrawer, type SaleStart } from './RecordSaleDrawer'
import { SaleDrawer } from './SaleDrawer'

const PAGE_SIZE = 20

/** Router state that opens the Record sale form, e.g. from a vehicle or a lead. */
export interface RecordSaleState {
  recordSale: SaleStart
}

const control =
  'h-9 rounded-md border border-slate-300 bg-white px-2.5 text-sm text-slate-700 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none'

export function SalesPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [q, setQ] = useState('')
  const [vehicleId, setVehicleId] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [channel, setChannel] = useState<SaleChannel | ''>('')
  const [page, setPage] = useState(1)
  const [recording, setRecording] = useState<SaleStart | null>(
    () => (location.state as RecordSaleState | null)?.recordSale ?? null,
  )
  const [recorded, setRecorded] = useState<Sale | null>(null)
  const search = useDebouncedValue(q.trim(), 300)

  useEffect(() => {
    // Forget the request so a reload or Back doesn't reopen the form.
    if ((location.state as RecordSaleState | null)?.recordSale) {
      navigate({ search: location.search }, { replace: true, state: null })
    }
  }, [location.state, location.search, navigate])

  const query = {
    q: search || undefined,
    vehicle_id: vehicleId ? Number(vehicleId) : undefined,
    channel: channel || undefined,
    date_from: dateFrom || undefined,
    date_to: dateTo && (!dateFrom || dateTo >= dateFrom) ? dateTo : undefined,
    tz: viewerTimeZone(),
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  }
  const { data, isPending, isError, error, refetch, isFetching } = useSales(query)
  const { data: vehicles } = useMyVehicles()
  const selected = Number(params.get('sale')) || null
  const filtered = Boolean(query.q || query.vehicle_id || query.channel || query.date_from || query.date_to)

  const select = (id: number | null) =>
    setParams((current) => {
      const next = new URLSearchParams(current)
      if (id === null) next.delete('sale')
      else next.set('sale', String(id))
      return next
    })
  const changeFilter = <T,>(setter: (value: T) => void) => (value: T) => {
    setter(value)
    setPage(1)
  }

  const totals = data?.totals
  const total = data?.total ?? 0
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="mx-auto max-w-[1760px] p-4 sm:p-6 lg:py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Sales</h1>
          <p className="mt-1 text-sm text-canvas-muted">Every completed sale of your vehicles, online or recorded by you.</p>
        </div>
        <Button icon={<Plus aria-hidden className="size-4" />} onClick={() => setRecording({})}>
          Record sale
        </Button>
      </div>

      {recorded && (
        <div className="mb-6">
          <Alert tone="success">
            <span className="font-medium">Sale #{recorded.id} recorded.</span> {recorded.quantity} × {recorded.vehicle_label} for{' '}
            {formatPrice(recorded.total_price)}.{' '}
            <button
              type="button"
              className="font-medium underline"
              onClick={() => void downloadInvoice(recorded.id, viewerTimeZone())}
            >
              Download invoice
            </button>
          </Alert>
        </div>
      )}

      <section aria-label="Sales summary" className="mb-6 grid gap-4 sm:grid-cols-3">
        <KpiCard
          label="Completed sales"
          value={totals ? totals.sales.toLocaleString('en-US') : '–'}
          hint={totals ? `${totals.units.toLocaleString('en-US')} units${filtered ? ' matching your filters' : ''}` : undefined}
          icon={ShoppingCart}
        />
        <KpiCard
          label="Revenue"
          value={totals ? formatPrice(totals.revenue) : '–'}
          hint="What customers paid"
          icon={CircleDollarSign}
          emphasis
        />
        <KpiCard
          label="Gross profit"
          value={totals ? moneyOrDash(totals.gross_profit) : '–'}
          hint={totals ? (profitCoverage(totals.sales_with_cost, totals.sales) ?? 'Revenue minus acquisition cost') : undefined}
          icon={TrendingUp}
          emphasis
        />
      </section>

      <section className="@container min-w-0 rounded-lg border border-slate-200 bg-white">
        <div className="flex flex-wrap items-end gap-3 border-b border-slate-200 px-4 py-3 sm:px-6">
          <label className="flex min-w-48 flex-1 flex-col gap-1 text-xs font-medium text-slate-500">
            Search
            <input
              type="search"
              aria-label="Search sales"
              placeholder="Customer, vehicle or #reference"
              value={q}
              onChange={(e) => changeFilter(setQ)(e.target.value)}
              className={control}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
            Vehicle
            <select value={vehicleId} onChange={(e) => changeFilter(setVehicleId)(e.target.value)} className={control}>
              <option value="">All vehicles</option>
              {(vehicles?.items ?? []).map((v) => (
                <option key={v.id} value={v.id}>
                  {vehicleTitle(v)} ({v.year})
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
            From
            <input type="date" value={dateFrom} onChange={(e) => changeFilter(setDateFrom)(e.target.value)} className={control} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
            To
            <input
              type="date"
              min={dateFrom || undefined}
              value={dateTo}
              onChange={(e) => changeFilter(setDateTo)(e.target.value)}
              className={control}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
            Channel
            <select value={channel} onChange={(e) => changeFilter(setChannel)(e.target.value as SaleChannel | '')} className={control}>
              <option value="">All channels</option>
              <option value="dealer">Recorded by you</option>
              <option value="online">Online</option>
            </select>
          </label>
          {isFetching && !isPending && <Spinner className="mb-2 text-slate-400" />}
        </div>

        {isPending ? (
          <div role="status" className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
            <Spinner /> Loading sales…
          </div>
        ) : isError ? (
          <div className="p-6">
            <Alert>
              <p>{error.message}</p>
              <Button variant="secondary" size="sm" className="mt-3" onClick={() => refetch()}>
                Try again
              </Button>
            </Alert>
          </div>
        ) : data.items.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
              <Receipt aria-hidden className="size-6" />
            </span>
            <p className="text-sm font-semibold text-slate-900">{filtered ? 'No sales match your filters' : 'No sales yet'}</p>
            <p className="max-w-xs text-sm text-slate-500">
              {filtered
                ? 'Try a wider date range or clear the search.'
                : 'Record a sale made on the lot, or wait for customers to buy online.'}
            </p>
            {!filtered && (
              <Button size="sm" icon={<Plus aria-hidden className="size-3.5" />} onClick={() => setRecording({})}>
                Record sale
              </Button>
            )}
          </div>
        ) : (
          <table aria-label="Sales history" className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50/60 text-xs font-medium text-slate-500">
              <tr>
                <th scope="col" className="hidden px-6 py-3 font-medium @3xl:table-cell">Date</th>
                <th scope="col" className="py-3 pr-3 pl-4 font-medium sm:pl-6 @3xl:pl-3">Sale</th>
                <th scope="col" className="hidden px-3 py-3 text-right font-medium @2xl:table-cell">Qty</th>
                <th scope="col" className="px-3 py-3 text-right font-medium">Revenue</th>
                <th scope="col" className="hidden px-3 py-3 text-right font-medium @4xl:table-cell">Cost</th>
                <th scope="col" className="hidden px-3 py-3 text-right font-medium @2xl:table-cell">Gross profit</th>
                <th scope="col" className="hidden px-3 py-3 text-right font-medium @3xl:table-cell">Ref</th>
                <th scope="col" className="py-3 pr-4 pl-3 sm:pr-6">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.items.map((sale) => (
                <tr key={sale.id} className="hover:bg-slate-50/60">
                  <td className="hidden px-6 py-3 whitespace-nowrap text-slate-600 @3xl:table-cell">{formatSaleDate(sale.sold_at)}</td>
                  <td className="py-3 pr-3 pl-4 sm:pl-6 @3xl:pl-3">
                    <p className="font-medium text-slate-900">{sale.vehicle_label}</p>
                    <p className="text-xs text-slate-500">
                      {sale.customer.name ?? 'Customer'}
                      {sale.channel === 'online' ? ' · Online' : ''}
                    </p>
                    <p className="text-xs text-slate-500 @3xl:hidden">
                      {formatSaleDate(sale.sold_at)} · {sale.quantity} unit{sale.quantity === 1 ? '' : 's'} · #{sale.id}
                    </p>
                  </td>
                  <td className="hidden px-3 py-3 text-right tabular-nums @2xl:table-cell">{sale.quantity}</td>
                  <td className="px-3 py-3 text-right font-semibold whitespace-nowrap text-slate-900 tabular-nums">
                    {formatPrice(sale.total_price)}
                  </td>
                  <td className="hidden px-3 py-3 text-right whitespace-nowrap text-slate-600 tabular-nums @4xl:table-cell">
                    {sale.unit_cost === null ? '—' : formatPrice(Number(sale.unit_cost) * sale.quantity)}
                  </td>
                  <td className="hidden px-3 py-3 text-right whitespace-nowrap tabular-nums @2xl:table-cell">
                    <span
                      className={
                        sale.gross_profit !== null && Number(sale.gross_profit) < 0 ? 'text-red-700 dark:text-red-300' : 'text-slate-900'
                      }
                    >
                      {moneyOrDash(sale.gross_profit)}
                    </span>
                  </td>
                  <td className="hidden px-3 py-3 text-right text-slate-500 tabular-nums @3xl:table-cell">#{sale.id}</td>
                  <td className="py-3 pr-4 pl-3 text-right sm:pr-6">
                    <Button variant="secondary" size="sm" aria-label={`View sale #${sale.id}`} onClick={() => select(sale.id)}>
                      View
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {total > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 text-sm text-slate-500 sm:px-6">
            <span>
              Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
            </span>
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" aria-label="Previous page" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                <ChevronLeft aria-hidden className="size-4" />
              </Button>
              <span className="tabular-nums">
                {page} / {pageCount}
              </span>
              <Button
                variant="secondary"
                size="sm"
                aria-label="Next page"
                disabled={page >= pageCount}
                onClick={() => setPage(page + 1)}
              >
                <ChevronRight aria-hidden className="size-4" />
              </Button>
            </div>
          </div>
        )}
      </section>

      {recording && (
        <RecordSaleDrawer
          start={recording}
          onClose={() => setRecording(null)}
          onRecorded={(sale) => {
            setRecording(null)
            setRecorded(sale)
          }}
        />
      )}
      {selected !== null && <SaleDrawer id={selected} onClose={() => select(null)} />}
    </div>
  )
}
