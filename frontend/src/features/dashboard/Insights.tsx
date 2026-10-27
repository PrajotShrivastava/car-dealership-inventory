import { useId, type ReactNode } from 'react'
import type { Dashboard } from '../../api/types'
import { formatPrice } from '../inventory/format'
import { percentChange, plural } from './format'
import { Panel } from './Panel'

const NOT_ENOUGH = 'Not enough sales data yet'

function Insight({ label, children, detail }: { label: string; children: ReactNode; detail?: string }) {
  const id = useId()
  return (
    <div role="group" aria-labelledby={id} className="py-3 first:pt-0 last:pb-0">
      <p id={id} className="text-xs font-medium tracking-wide text-slate-500 uppercase">
        {label}
      </p>
      <p className="mt-1 text-sm font-medium text-slate-900">{children}</p>
      {detail && <p className="text-xs text-slate-500">{detail}</p>}
    </div>
  )
}

function trend(data: Dashboard): { text: string; detail?: string } {
  const s = data.summary
  if (!s.has_sales_before_this_month) {
    return s.units_sold_this_month > 0
      ? { text: NOT_ENOUGH, detail: 'A comparison appears after your first full month of sales.' }
      : { text: NOT_ENOUGH }
  }
  const change = percentChange(s.units_sold_this_month, s.units_sold_last_month)
  const detail = `${plural(s.units_sold_this_month, 'unit')} this month, ${s.units_sold_last_month} last month`
  if (change === null) return { text: 'Sales this month after none last month', detail }
  if (change === 0) return { text: 'Level with last month', detail }
  return { text: `${change > 0 ? 'Up' : 'Down'} ${Math.abs(change)}% on last month`, detail }
}

export function Insights({ data }: { data: Dashboard }) {
  const s = data.summary
  const watch = s.low_stock + s.out_of_stock
  const salesTrend = trend(data)
  return (
    <Panel title="Performance insights" description="Drawn only from your recorded sales">
      <div className="divide-y divide-slate-100">
        <Insight
          label="Best-selling vehicle"
          detail={data.best_seller ? `${plural(data.best_seller.units_sold, 'unit')} sold` : undefined}
        >
          {data.best_seller?.label ?? NOT_ENOUGH}
        </Insight>
        <Insight label="Highest revenue" detail={data.top_revenue?.label}>
          {data.top_revenue ? formatPrice(data.top_revenue.revenue) : NOT_ENOUGH}
        </Insight>
        <Insight label="Stock to watch">
          {s.total_listings === 0
            ? 'No listings yet'
            : watch
              ? `${plural(watch, 'listing')} low or out of stock`
              : 'All listings are well stocked'}
        </Insight>
        <Insight label="Unsold listings">
          {s.total_listings === 0
            ? 'No listings yet'
            : s.never_sold
              ? `${plural(s.never_sold, 'listing')} with no sales yet`
              : 'Every listing has sold at least once'}
        </Insight>
        <Insight label="Sales trend" detail={salesTrend.detail}>
          {salesTrend.text}
        </Insight>
      </div>
    </Panel>
  )
}
