import { Loader2 } from 'lucide-react'
import { cn } from './cn'

export function Spinner({ className }: { className?: string }) {
  return <Loader2 aria-hidden className={cn('size-4 animate-spin', className)} />
}

export function FullPageSpinner() {
  return (
    <div role="status" className="flex h-full items-center justify-center text-slate-500">
      <Spinner className="size-6" />
      <span className="sr-only">Loading…</span>
    </div>
  )
}
