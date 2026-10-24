import { AlertTriangle, ShieldCheck } from 'lucide-react'
import { useEffect, useId, useRef, type ReactNode } from 'react'
import { Button } from './Button'

interface ConfirmDialogProps {
  title: string
  children: ReactNode
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
  busy?: boolean
  tone?: 'danger' | 'primary'
}

export function ConfirmDialog({ title, children, confirmLabel, onConfirm, onCancel, busy, tone = 'danger' }: ConfirmDialogProps) {
  const titleId = useId()
  const cancelRef = useRef<HTMLButtonElement>(null)

  // Latest onCancel without re-running the effects below on every render.
  const onCancelRef = useRef(onCancel)
  useEffect(() => {
    onCancelRef.current = onCancel
  })

  // Focus Cancel once, when the dialog opens (not on every re-render, which
  // would steal focus from fields inside the dialog).
  useEffect(() => {
    cancelRef.current?.focus()
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onCancelRef.current()
      }
    }
    // Capture phase so Escape closes this dialog before the drawer underneath.
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [])

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div aria-hidden className="absolute inset-0 bg-black/60" onClick={onCancel} />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative w-full max-w-sm rounded-lg bg-white p-6 shadow-2xl"
      >
        <div className="flex gap-4">
          <span
            className={
              tone === 'danger'
                ? 'flex size-10 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-400'
                : 'flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600'
            }
          >
            {tone === 'danger' ? <AlertTriangle aria-hidden className="size-5" /> : <ShieldCheck aria-hidden className="size-5" />}
          </span>
          <div>
            <h2 id={titleId} className="text-base font-semibold text-slate-900">
              {title}
            </h2>
            <div className="mt-1 text-sm text-slate-500">{children}</div>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button ref={cancelRef} variant="secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button variant={tone} onClick={onConfirm} loading={busy}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
