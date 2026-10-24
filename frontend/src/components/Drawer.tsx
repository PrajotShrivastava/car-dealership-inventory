import { X } from 'lucide-react'
import { useEffect, useId, useRef, type ReactNode } from 'react'

interface DrawerProps {
  title: string
  subtitle?: ReactNode
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
}

/** Right-side panel over a dimmed page; full-screen sheet on small screens. */
export function Drawer({ title, subtitle, onClose, children, footer }: DrawerProps) {
  const titleId = useId()
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null
    closeRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      previouslyFocused?.focus?.()
    }
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div aria-hidden className="absolute inset-0 bg-slate-900/40" onClick={onClose} />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative flex h-full w-full flex-col bg-white shadow-2xl sm:max-w-lg"
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="truncate text-base font-semibold text-slate-900">
              {title}
            </h2>
            {subtitle && <div className="mt-0.5 text-sm text-slate-500">{subtitle}</div>}
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close details"
            className="-mr-1 rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="size-5" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        {footer && <footer className="border-t border-slate-200 bg-white px-6 py-4">{footer}</footer>}
      </section>
    </div>
  )
}
