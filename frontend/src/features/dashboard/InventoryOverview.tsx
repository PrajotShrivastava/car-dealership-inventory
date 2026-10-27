import { Plus } from 'lucide-react'
import { useId, useState } from 'react'
import { Link } from 'react-router'
import type { Dashboard, DashboardVehicle } from '../../api/types'
import { Button } from '../../components/Button'
import { Tabs } from '../../components/Tabs'
import { cn } from '../../components/cn'
import { APP_INVENTORY } from '../../paths'
import { formatPrice } from '../inventory/format'
import { VehicleThumb } from '../inventory/VehicleThumb'
import { formatCount, plural } from './format'
import { Panel, PanelEmpty } from './Panel'

type ListTab = 'stock' | 'top' | 'unsold' | 'recent'

const TABS: { value: ListTab; label: string }[] = [
  { value: 'stock', label: 'Needs stock' },
  { value: 'top', label: 'Top sellers' },
  { value: 'unsold', label: 'Never sold' },
  { value: 'recent', label: 'Recently added' },
]

const EMPTY: Record<ListTab, string> = {
  stock: 'Every listing has more than a couple of units left.',
  top: 'Not enough sales data yet.',
  unsold: 'Every listing has sold at least once.',
  recent: 'No listings yet.',
}

const levelDot = { in: 'bg-emerald-500', low: 'bg-amber-500', out: 'bg-red-500' }

function StockTile({ label, hint, count, level }: { label: string; hint: string; count: number; level: keyof typeof levelDot }) {
  const id = useId()
  return (
    <div role="group" aria-labelledby={id} className="rounded-md border border-slate-200 px-4 py-3">
      <p id={id} className="flex items-center gap-2 text-sm text-slate-600">
        <span aria-hidden className={cn('size-2 rounded-full', levelDot[level])} />
        {label}
      </p>
      <p className="mt-1 text-xl font-semibold text-slate-900 tabular-nums">{formatCount(count)}</p>
      <p className="text-xs text-slate-500">{hint}</p>
    </div>
  )
}

function VehicleLine({ vehicle, units, label }: { vehicle: DashboardVehicle | null; units: number; label: string }) {
  const body = (
    <>
      {vehicle ? (
        <VehicleThumb category={vehicle.category} photo={vehicle.photo ?? undefined} />
      ) : (
        <div aria-hidden className="h-16 w-24 shrink-0 rounded-md border border-dashed border-slate-200" />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-900">{vehicle ? `${vehicle.make} ${vehicle.model}` : label}</p>
        <p className="truncate text-xs text-slate-500">
          {vehicle
            ? [vehicle.year, vehicle.trim, formatPrice(vehicle.price)].filter(Boolean).join(' · ')
            : 'Removed from inventory'}
        </p>
      </div>
      <div className="shrink-0 text-right text-xs tabular-nums">
        {vehicle && (
          <p className={cn('font-medium', vehicle.quantity === 0 ? 'text-red-700 dark:text-red-300' : 'text-slate-900')}>
            {vehicle.quantity === 0 ? 'Out of stock' : `${formatCount(vehicle.quantity)} left`}
          </p>
        )}
        <p className="text-slate-500">{formatCount(units)} sold</p>
      </div>
    </>
  )
  const row = 'flex items-center gap-3 rounded-md px-2 py-2'
  return (
    <li>
      {vehicle ? (
        <Link to={`${APP_INVENTORY}?vehicle=${vehicle.id}`} className={cn(row, 'hover:bg-slate-50')}>
          {body}
        </Link>
      ) : (
        <div className={row}>{body}</div>
      )}
    </li>
  )
}

export function InventoryOverview({ data, onAdd }: { data: Dashboard; onAdd: () => void }) {
  const [tab, setTab] = useState<ListTab>('stock')
  const { summary } = data

  const lines =
    tab === 'top'
      ? data.top_sellers.map((t) => ({ key: t.vehicle?.id ?? t.label, vehicle: t.vehicle, units: t.units_sold, label: t.label }))
      : (tab === 'stock'
          ? [...data.out_of_stock, ...data.low_stock]
          : tab === 'unsold'
            ? data.never_sold
            : data.recent_listings
        ).map((v) => ({ key: v.id, vehicle: v, units: v.units_sold, label: '' }))

  return (
    <Panel title="Inventory overview" description="Stock levels across your listings">
      {summary.total_listings === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-md border border-dashed border-slate-200 px-4 py-10 text-center">
          <p className="text-sm font-semibold text-slate-900">You haven't listed any vehicles yet</p>
          <p className="max-w-xs text-sm text-slate-500">Your stock levels and best sellers appear here once you add vehicles.</p>
          <Button size="sm" icon={<Plus aria-hidden className="size-3.5" />} onClick={onAdd}>
            Add your first vehicle
          </Button>
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <StockTile label="In stock" hint={`More than ${summary.low_stock_threshold} units`} count={summary.in_stock} level="in" />
            <StockTile
              label="Low stock"
              hint={`1–${summary.low_stock_threshold} units left`}
              count={summary.low_stock}
              level="low"
            />
            <StockTile label="Out of stock" hint="No units left" count={summary.out_of_stock} level="out" />
          </div>
          <div className="-mx-5 mt-5 sm:-mx-6">
            <Tabs label="Vehicle lists" tabs={TABS} value={tab} onChange={setTab} />
          </div>
          {lines.length ? (
            <ul className="mt-2 divide-y divide-slate-100">
              {lines.map((line) => (
                <VehicleLine key={line.key} vehicle={line.vehicle} units={line.units} label={line.label} />
              ))}
            </ul>
          ) : (
            <div className="mt-4 flex flex-1">
              <PanelEmpty title={EMPTY[tab]} />
            </div>
          )}
          {tab === 'unsold' && summary.never_sold > data.never_sold.length && (
            <p className="mt-2 text-xs text-slate-500">Showing the newest of {plural(summary.never_sold, 'unsold listing')}.</p>
          )}
        </>
      )}
    </Panel>
  )
}
