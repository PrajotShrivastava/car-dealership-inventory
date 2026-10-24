import { CarFront } from 'lucide-react'
import { cn } from './cn'

export function Logo({ inverted = false, compact = false }: { inverted?: boolean; compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <span className="flex size-8 items-center justify-center rounded-md bg-brand-500 text-on-brand">
        <CarFront aria-hidden className="size-[18px]" />
      </span>
      {!compact && (
        <span className={cn('text-lg font-bold tracking-tight', inverted ? 'text-on-accent' : 'text-ink-900 dark:text-slate-900')}>
          DriveStock
        </span>
      )}
    </span>
  )
}
