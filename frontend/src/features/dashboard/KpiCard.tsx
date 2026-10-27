import type { LucideIcon } from 'lucide-react'
import { useId } from 'react'
import { cn } from '../../components/cn'

export type Trend = { text: string; direction: 'up' | 'down' | 'flat' }

/** One headline figure. `trend` is shown only when there is real history to compare with. */
export function KpiCard({
  label,
  value,
  hint,
  trend,
  icon: Icon,
  emphasis = false,
}: {
  label: string
  value: string
  hint?: string
  trend?: Trend
  icon: LucideIcon
  emphasis?: boolean
}) {
  const id = useId()
  return (
    <div
      role="group"
      aria-labelledby={id}
      className="flex min-w-0 flex-col gap-3 rounded-lg border border-slate-200 bg-white p-5"
    >
      <div className="flex items-center justify-between gap-3">
        <p id={id} className="text-sm font-medium text-slate-500">
          {label}
        </p>
        <span
          aria-hidden
          className={cn(
            'flex size-8 shrink-0 items-center justify-center rounded-md',
            emphasis ? 'bg-brand-50 text-brand-600' : 'bg-slate-100 text-slate-500',
          )}
        >
          <Icon className="size-4" />
        </span>
      </div>
      <p className="truncate text-2xl font-semibold tracking-tight text-slate-900 tabular-nums">{value}</p>
      {trend ? (
        <p
          className={cn(
            'text-xs font-medium',
            trend.direction === 'up' && 'text-emerald-700 dark:text-emerald-300',
            trend.direction === 'down' && 'text-red-700 dark:text-red-300',
            trend.direction === 'flat' && 'text-slate-500',
          )}
        >
          {trend.text}
        </p>
      ) : (
        hint && <p className="text-xs text-slate-500">{hint}</p>
      )}
    </div>
  )
}
