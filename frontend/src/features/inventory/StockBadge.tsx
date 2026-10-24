import { cn } from '../../components/cn'
import { stockLevel } from './format'

const styles = {
  in: { badge: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-400/10 dark:text-emerald-300 dark:ring-emerald-400/25', dot: 'bg-emerald-500' },
  low: { badge: 'bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-400/10 dark:text-amber-300 dark:ring-amber-400/25', dot: 'bg-amber-500' },
  out: { badge: 'bg-red-50 text-red-700 ring-red-600/20 dark:bg-red-400/10 dark:text-red-300 dark:ring-red-400/25', dot: 'bg-red-500' },
}

export function StockBadge({ quantity, className }: { quantity: number; className?: string }) {
  const level = stockLevel(quantity)
  const label = level === 'out' ? 'Out of stock' : `${level === 'low' ? 'Low stock' : 'In stock'} · ${quantity}`
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset',
        styles[level].badge,
        className,
      )}
    >
      <span aria-hidden className={cn('size-1.5 rounded-full', styles[level].dot)} />
      {label}
    </span>
  )
}
