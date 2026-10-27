import {
  Boxes,
  CarFront,
  CircleDollarSign,
  PackageX,
  PiggyBank,
  Plus,
  Receipt,
  ShoppingCart,
  TrendingUp,
  Wallet,
  Warehouse,
} from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import type { DashboardRange, DashboardSummary } from '../../api/types'
import { useAuth } from '../../auth/AuthContext'
import { Alert } from '../../components/Alert'
import { Button } from '../../components/Button'
import { APP_INVENTORY } from '../../paths'
import type { AddVehicleState } from '../inventory/InventoryPage'
import { formatPrice } from '../inventory/format'
import { profitCoverage } from '../sales/format'
import { FollowUps } from './FollowUps'
import { formatCount, percentChange } from './format'
import { Insights } from './Insights'
import { InventoryOverview } from './InventoryOverview'
import { KpiCard, type Trend } from './KpiCard'
import { useDashboard } from './queries'
import { RecentActivity } from './RecentActivity'
import { RecentSales } from './RecentSales'
import { SalesChart } from './SalesChart'

const linkButton =
  'inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-3.5 text-sm font-medium text-slate-700 hover:bg-slate-50'

/** Compared with last month only when earlier sales exist; a percentage only when it's defined. */
function monthTrend(summary: DashboardSummary, current: number, previous: number): Trend | undefined {
  if (!summary.has_sales_before_this_month) return undefined
  const change = percentChange(current, previous)
  if (change === null) return { text: 'None last month', direction: 'flat' }
  if (change === 0) return { text: 'Same as last month', direction: 'flat' }
  return { text: `${change > 0 ? '+' : '−'}${Math.abs(change)}% vs last month`, direction: change > 0 ? 'up' : 'down' }
}

function Skeleton() {
  const block = 'animate-pulse rounded-lg border border-slate-200 bg-white'
  return (
    <div role="status" aria-label="Loading dashboard" className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className={`${block} h-[132px]`} />
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-3">
        <div className={`${block} h-80 xl:col-span-2`} />
        <div className={`${block} h-80`} />
      </div>
    </div>
  )
}

function SectionLabel({ children }: { children: string }) {
  return <h3 className="mb-3 text-xs font-medium tracking-wide text-canvas-muted uppercase">{children}</h3>
}

export function DashboardPage() {
  const [months, setMonths] = useState<DashboardRange>(6)
  const { data, isPending, isError, error, refetch, isFetching } = useDashboard(months)
  const { user } = useAuth()
  const navigate = useNavigate()
  const addVehicle = () => navigate(APP_INVENTORY, { state: { addVehicle: true } satisfies AddVehicleState })

  const s = data?.summary
  return (
    <div className="mx-auto max-w-[1760px] p-4 sm:p-6 lg:py-8">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Dashboard</h1>
          <p className="mt-1 text-sm text-canvas-muted">
            {user ? `Welcome back, ${user.full_name.split(' ')[0]}. ` : ''}Your sales and inventory at a glance.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link to={APP_INVENTORY} className={linkButton}>
            View all inventory
          </Link>
          <Link
            to={s?.out_of_stock ? `${APP_INVENTORY}?availability=out_of_stock` : APP_INVENTORY}
            className={linkButton}
          >
            Manage stock
          </Link>
          <Button icon={<Plus aria-hidden className="size-4" />} onClick={addVehicle}>
            Add vehicle
          </Button>
        </div>
      </div>

      {isPending ? (
        <Skeleton />
      ) : isError ? (
        <Alert>
          <p className="font-medium">Couldn't load your dashboard.</p>
          <p className="mt-0.5">{error.message}</p>
          <Button variant="secondary" size="sm" className="mt-3" onClick={() => refetch()}>
            Try again
          </Button>
        </Alert>
      ) : (
        <div className="space-y-8">
          <section aria-label="Key figures" className="space-y-6">
            <div>
              <SectionLabel>Sales</SectionLabel>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                <KpiCard
                  label="Total sales revenue"
                  value={formatPrice(s!.total_revenue)}
                  hint="What customers paid, all completed sales"
                  icon={CircleDollarSign}
                  emphasis
                />
                <KpiCard
                  label="Gross profit"
                  value={s!.gross_profit === null ? '—' : formatPrice(s!.gross_profit)}
                  hint={profitCoverage(s!.sales_with_cost, s!.sales_count) ?? 'Revenue minus acquisition cost'}
                  icon={PiggyBank}
                  emphasis
                />
                <KpiCard
                  label="Revenue this month"
                  value={formatPrice(s!.revenue_this_month)}
                  hint="This calendar month"
                  trend={monthTrend(s!, Number(s!.revenue_this_month), Number(s!.revenue_last_month))}
                  icon={TrendingUp}
                  emphasis
                />
                <KpiCard
                  label="Completed sales"
                  value={formatCount(s!.sales_count)}
                  hint="Sale transactions, online and recorded"
                  icon={Receipt}
                />
                <KpiCard label="Units sold" value={formatCount(s!.units_sold)} hint="All time" icon={ShoppingCart} />
                <KpiCard
                  label="Sales this month"
                  value={formatCount(s!.units_sold_this_month)}
                  hint="Units this calendar month"
                  trend={monthTrend(s!, s!.units_sold_this_month, s!.units_sold_last_month)}
                  icon={CarFront}
                />
              </div>
            </div>
            <div>
              <SectionLabel>Inventory</SectionLabel>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <KpiCard label="Total listings" value={formatCount(s!.total_listings)} hint="Vehicles you've listed" icon={Boxes} />
                <KpiCard
                  label="Available stock"
                  value={formatCount(s!.available_stock)}
                  hint="Units ready to sell"
                  icon={Warehouse}
                />
                <KpiCard label="Out of stock" value={formatCount(s!.out_of_stock)} hint="Listings with no units left" icon={PackageX} />
                <KpiCard label="Inventory value" value={formatPrice(s!.inventory_value)} hint="Units in stock × list price" icon={Wallet} />
              </div>
            </div>
          </section>

          <div className="grid gap-6 xl:grid-cols-3">
            <div className="xl:col-span-2">
              <SalesChart
                monthly={data.monthly}
                months={months}
                onMonthsChange={setMonths}
                updating={isFetching && !isPending}
              />
            </div>
            <Insights data={data} />
          </div>

          <div className="grid gap-6 xl:grid-cols-3">
            <div className="xl:col-span-2">
              <InventoryOverview data={data} onAdd={addVehicle} />
            </div>
            <RecentActivity data={data} />
          </div>

          <div className="grid gap-6 xl:grid-cols-3">
            <div className="xl:col-span-2">
              <RecentSales sales={data.recent_sales} />
            </div>
            <FollowUps data={data.follow_ups} />
          </div>
        </div>
      )}
    </div>
  )
}
