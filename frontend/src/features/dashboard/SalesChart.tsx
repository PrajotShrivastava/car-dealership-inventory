import { useState } from 'react'
import { DASHBOARD_RANGES, type DashboardRange, type MonthlySales } from '../../api/types'
import { Spinner } from '../../components/Spinner'
import { cn } from '../../components/cn'
import { formatPrice } from '../inventory/format'
import { formatCount, formatMonth, plural } from './format'
import { Panel, PanelEmpty } from './Panel'

type Metric = 'units' | 'revenue'

const compactMoney = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumFractionDigits: 1,
})

/** A round step (1, 2 or 5 × 10ⁿ) giving about four gridlines; whole numbers for units. */
function gridStep(max: number, wholeNumbers: boolean): number {
  const raw = max / 4
  const magnitude = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 5, 10].map((m) => m * magnitude).find((s) => s >= raw) ?? raw
  return wholeNumbers ? Math.max(1, Math.ceil(step)) : step
}

function MetricToggle({ value, onChange }: { value: Metric; onChange: (value: Metric) => void }) {
  return (
    <div className="inline-flex rounded-md border border-slate-300 p-0.5" role="group" aria-label="Measure">
      {(['units', 'revenue'] as const).map((metric) => (
        <button
          key={metric}
          type="button"
          aria-pressed={value === metric}
          onClick={() => onChange(metric)}
          className={cn(
            'rounded px-2.5 py-1 text-xs font-medium transition-colors',
            value === metric ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900' : 'text-slate-600 hover:text-slate-900',
          )}
        >
          {metric === 'units' ? 'Units' : 'Revenue'}
        </button>
      ))}
    </div>
  )
}

export function SalesChart({
  monthly,
  months,
  onMonthsChange,
  updating,
}: {
  monthly: MonthlySales[]
  months: DashboardRange
  onMonthsChange: (months: DashboardRange) => void
  updating: boolean
}) {
  const [metric, setMetric] = useState<Metric>('units')
  const [hovered, setHovered] = useState<number | null>(null)

  const values = monthly.map((m) => (metric === 'units' ? m.units : Number(m.revenue)))
  const max = Math.max(...values, 0)
  const step = max > 0 ? gridStep(max, metric === 'units') : 1
  const top = Math.max(step, Math.ceil(max / step) * step)
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step)
  const formatValue = (value: number) =>
    metric === 'units' ? formatCount(value) : value === 0 ? '$0' : compactMoney.format(value)
  const hasSales = monthly.some((m) => m.units > 0)

  return (
    <Panel
      title="Sales overview"
      description={`Units sold and revenue per month, last ${months} months`}
      actions={
        <>
          {updating && <Spinner className="text-slate-400" />}
          <MetricToggle value={metric} onChange={setMetric} />
          <select
            aria-label="Time range"
            value={months}
            onChange={(e) => onMonthsChange(Number(e.target.value) as DashboardRange)}
            className="h-8 rounded-md border border-slate-300 bg-white px-2 pr-7 text-sm text-slate-700 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none"
          >
            {DASHBOARD_RANGES.map((range) => (
              <option key={range} value={range}>
                Last {range} months
              </option>
            ))}
          </select>
        </>
      }
    >
      {hasSales ? (
        <div className="flex flex-col">
          <div className="relative h-56 pl-12">
            {ticks.map((tick) => (
              <div
                key={tick}
                aria-hidden
                className="absolute right-0 left-12 border-t border-slate-200"
                style={{ bottom: `${(tick / top) * 100}%` }}
              >
                <span className="absolute -top-2 -left-12 w-10 text-right text-[11px] leading-none text-slate-500 tabular-nums">
                  {formatValue(tick)}
                </span>
              </div>
            ))}
            <div className="relative flex h-full items-end gap-1.5 sm:gap-3">
              {monthly.map((month, i) => {
                const value = values[i]!
                const height = (value / top) * 100
                const last = i === monthly.length - 1
                return (
                  <div
                    key={month.month}
                    data-testid={`bar-${month.month}`}
                    onMouseEnter={() => setHovered(i)}
                    onMouseLeave={() => setHovered(null)}
                    className="group relative flex h-full flex-1 cursor-default flex-col items-center justify-end"
                  >
                    {last && value > 0 && hovered === null && (
                      <span
                        aria-hidden
                        className="absolute text-xs font-semibold text-slate-900 tabular-nums"
                        style={{ bottom: `calc(${height}% + 4px)` }}
                      >
                        {formatValue(value)}
                      </span>
                    )}
                    <div
                      aria-hidden
                      className={cn(
                        'w-full max-w-12 rounded-t-[4px] bg-chart-bar transition-opacity',
                        hovered !== null && hovered !== i && 'opacity-50',
                      )}
                      style={{ height: `${height}%` }}
                    />
                    {hovered === i && (
                      <div
                        role="tooltip"
                        className={cn(
                          'pointer-events-none absolute z-10 min-w-32 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg',
                          i > monthly.length / 2 ? 'right-0' : 'left-0',
                        )}
                        style={{ bottom: `calc(${Math.min(height, 70)}% + 8px)` }}
                      >
                        <p className="font-semibold text-slate-900">{formatMonth(month.month)}</p>
                        <p className="mt-1 text-slate-600 tabular-nums">{plural(month.units, 'unit')}</p>
                        <p className="text-slate-600 tabular-nums">{formatPrice(month.revenue)}</p>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
          <div aria-hidden className="mt-2 flex gap-1.5 pl-12 sm:gap-3">
            {monthly.map((month) => (
              <span key={month.month} className="flex-1 truncate text-center text-[11px] text-slate-500">
                {formatMonth(month.month, 'short')}
              </span>
            ))}
          </div>
        </div>
      ) : (
        <PanelEmpty title="No sales yet">
          Monthly units and revenue appear here once customers buy your vehicles.
        </PanelEmpty>
      )}

      <table className="sr-only">
        <caption>Monthly sales, last {months} months</caption>
        <thead>
          <tr>
            <th scope="col">Month</th>
            <th scope="col">Units sold</th>
            <th scope="col">Revenue</th>
          </tr>
        </thead>
        <tbody>
          {monthly.map((month) => (
            <tr key={month.month}>
              <th scope="row">{formatMonth(month.month)}</th>
              <td>{month.units}</td>
              <td>{formatPrice(month.revenue)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  )
}
