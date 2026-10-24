import { AlertCircle, CheckCircle2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from './cn'

export function Alert({ tone = 'error', children }: { tone?: 'error' | 'success'; children: ReactNode }) {
  const Icon = tone === 'error' ? AlertCircle : CheckCircle2
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn(
        'flex items-start gap-2 rounded-md border px-3 py-2.5 text-sm',
        tone === 'error' ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-400/30 dark:bg-red-500/10 dark:text-red-300' : 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-400/30 dark:bg-emerald-500/10 dark:text-emerald-300',
      )}
    >
      <Icon aria-hidden className="mt-0.5 size-4 shrink-0" />
      <div>{children}</div>
    </div>
  )
}
