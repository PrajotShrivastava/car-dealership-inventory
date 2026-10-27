import { useId, type ReactNode } from 'react'
import { cn } from '../../components/cn'

/** A titled dashboard card; the title names the region for assistive technology. */
export function Panel({
  title,
  description,
  actions,
  className,
  children,
}: {
  title: string
  description?: string
  actions?: ReactNode
  className?: string
  children: ReactNode
}) {
  const id = useId()
  return (
    <section aria-labelledby={id} className={cn('flex h-full min-w-0 flex-col rounded-lg border border-slate-200 bg-white', className)}>
      <header className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5 sm:px-6">
        <div>
          <h2 id={id} className="text-base font-semibold text-slate-900">
            {title}
          </h2>
          {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </header>
      <div className="flex flex-1 flex-col px-5 pt-4 pb-5 sm:px-6">{children}</div>
    </section>
  )
}

/** A neutral message for a panel with nothing to show yet. */
export function PanelEmpty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-1 rounded-md border border-dashed border-slate-200 px-4 py-8 text-center">
      <p className="text-sm font-medium text-slate-900">{title}</p>
      {children && <p className="max-w-xs text-sm text-slate-500">{children}</p>}
    </div>
  )
}
