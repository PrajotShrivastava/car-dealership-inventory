import { CalendarDays, Download, MessageSquare, ShoppingBag, type LucideIcon } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { ApiError } from '../../api/client'
import type { AccountEnquiry, AccountPurchase, EnquiryProgress, Page } from '../../api/types'
import { useAuth } from '../../auth/AuthContext'
import { Alert } from '../../components/Alert'
import { Button } from '../../components/Button'
import { cn } from '../../components/cn'
import { Spinner } from '../../components/Spinner'
import { APP_INVENTORY } from '../../paths'
import { viewerTimeZone } from '../../time'
import { formatPrice } from '../inventory/format'
import { downloadPurchaseInvoice, useEnquiries, usePurchases } from './queries'

const day = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' })
const formatDate = (iso: string) => day.format(new Date(iso))

const PROGRESS: Record<EnquiryProgress, { label: string; hint: string; style: string }> = {
  sent: {
    label: 'Sent',
    hint: 'Waiting for the dealer to get in touch.',
    style: 'bg-sky-50 text-sky-700 ring-sky-600/20 dark:bg-sky-400/10 dark:text-sky-300 dark:ring-sky-400/25',
  },
  in_progress: {
    label: 'In progress',
    hint: 'The dealer is talking with you.',
    style: 'bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-400/10 dark:text-amber-300 dark:ring-amber-400/25',
  },
  test_drive_scheduled: {
    label: 'Test drive booked',
    hint: 'The dealer has arranged your test drive.',
    style: 'bg-violet-50 text-violet-700 ring-violet-600/20 dark:bg-violet-400/10 dark:text-violet-300 dark:ring-violet-400/25',
  },
  completed: {
    label: 'Completed',
    hint: 'This ended in a sale.',
    style: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-400/10 dark:text-emerald-300 dark:ring-emerald-400/25',
  },
  closed: {
    label: 'Closed',
    hint: 'The dealer has closed this. You can send a new one from the vehicle.',
    style: 'bg-slate-100 text-slate-600 ring-slate-500/20',
  },
}

interface ListQuery<T> {
  data?: { pages: Page<T>[] }
  isPending: boolean
  isError: boolean
  error: Error | null
  refetch: () => unknown
  hasNextPage: boolean
  fetchNextPage: () => unknown
  isFetchingNextPage: boolean
}

/** A card with loading, error, empty and "Show more" states around a list of items. */
function Section<T>({
  title,
  description,
  query,
  empty,
  children,
}: {
  title: string
  description: string
  query: ListQuery<T>
  empty: { icon: LucideIcon; title: string; text: string }
  children: (items: T[]) => ReactNode
}) {
  const items = query.data?.pages.flatMap((page) => page.items) ?? []
  const total = query.data?.pages[0]?.total ?? 0
  const headingId = `${title.toLowerCase().replace(/\W+/g, '-')}-heading`
  const EmptyIcon = empty.icon
  return (
    <section aria-labelledby={headingId} className="rounded-lg border border-slate-200 bg-white">
      <header className="border-b border-slate-200 px-4 py-4 sm:px-6">
        <h2 id={headingId} className="text-base font-semibold text-slate-900">
          {title} {query.data && <span className="font-normal text-slate-500">({total})</span>}
        </h2>
        <p className="mt-0.5 text-sm text-slate-500">{description}</p>
      </header>
      {query.isPending ? (
        <div role="status" className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500">
          <Spinner /> Loading…
        </div>
      ) : query.isError ? (
        <div className="p-6">
          <Alert>
            <p>{query.error?.message}</p>
            <Button variant="secondary" size="sm" className="mt-3" onClick={() => query.refetch()}>
              Try again
            </Button>
          </Alert>
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
            <EmptyIcon aria-hidden className="size-6" />
          </span>
          <p className="text-sm font-semibold text-slate-900">{empty.title}</p>
          <p className="max-w-xs text-sm text-slate-500">{empty.text}</p>
          <Link to={APP_INVENTORY} className="text-sm font-medium text-brand-600 hover:text-brand-700">
            Browse vehicles
          </Link>
        </div>
      ) : (
        <>
          {children(items)}
          {query.hasNextPage && (
            <div className="border-t border-slate-200 px-4 py-3 text-center sm:px-6">
              <Button variant="secondary" size="sm" loading={query.isFetchingNextPage} onClick={() => query.fetchNextPage()}>
                Show more
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  )
}

function PurchaseRow({ purchase }: { purchase: AccountPurchase }) {
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function download() {
    setDownloading(true)
    setError(null)
    try {
      await downloadPurchaseInvoice(purchase.id, viewerTimeZone())
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not download the invoice.')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <li className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:gap-6 sm:px-6">
      <div className="min-w-0 flex-1">
        <p className="font-medium text-slate-900">{purchase.vehicle_label}</p>
        <p className="mt-0.5 text-xs text-slate-500">
          {formatDate(purchase.sold_at)} · Sold by {purchase.seller} · {purchase.invoice_number}
        </p>
        {error && (
          <div className="mt-2">
            <Alert>{error}</Alert>
          </div>
        )}
      </div>
      <div className="flex items-center justify-between gap-4 sm:justify-end">
        <div className="text-right">
          <p className="font-semibold text-slate-900 tabular-nums">{formatPrice(purchase.total_price)}</p>
          {purchase.quantity > 1 && (
            <p className="text-xs text-slate-500 tabular-nums">
              {purchase.quantity} × {formatPrice(purchase.unit_price)}
            </p>
          )}
        </div>
        <Button
          variant="secondary"
          size="sm"
          loading={downloading}
          icon={<Download aria-hidden className="size-3.5" />}
          aria-label={`Download invoice ${purchase.invoice_number}`}
          onClick={download}
        >
          Invoice
        </Button>
      </div>
    </li>
  )
}

function EnquiryRow({ enquiry }: { enquiry: AccountEnquiry }) {
  const progress = PROGRESS[enquiry.progress]
  const Icon = enquiry.kind === 'test_drive' ? CalendarDays : MessageSquare
  return (
    <li className="flex items-start gap-4 px-4 py-4 sm:px-6">
      <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500">
        <Icon aria-hidden className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-medium text-slate-900">
          {enquiry.kind === 'test_drive' ? 'Test drive request' : 'Question'}
          {enquiry.vehicle_label && <span className="font-normal text-slate-600"> · {enquiry.vehicle_label}</span>}
        </p>
        <p className="mt-0.5 text-xs text-slate-500">
          Sent {formatDate(enquiry.sent_at)}. {progress.hint}
        </p>
      </div>
      <span
        className={cn(
          'inline-flex shrink-0 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset',
          progress.style,
        )}
      >
        {progress.label}
      </span>
    </li>
  )
}

export function AccountPage() {
  const { user } = useAuth()
  const purchases = usePurchases()
  const enquiries = useEnquiries()

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6 lg:py-8">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">My account</h1>
        <p className="mt-1 text-sm text-canvas-muted">
          {user?.full_name} · {user?.email}
        </p>
      </div>

      <Section
        title="Purchases"
        description="Vehicles you bought, with an invoice for each."
        query={purchases}
        empty={{ icon: ShoppingBag, title: 'No purchases yet', text: 'Vehicles you buy will appear here with their invoices.' }}
      >
        {(items) => (
          <ul aria-label="Purchases" className="divide-y divide-slate-100">
            {items.map((purchase) => (
              <PurchaseRow key={purchase.id} purchase={purchase} />
            ))}
          </ul>
        )}
      </Section>

      <Section
        title="Enquiries"
        description="Questions and test drive requests you sent to dealers, and where each one stands."
        query={enquiries}
        empty={{
          icon: MessageSquare,
          title: 'No enquiries yet',
          text: 'Ask a dealer a question or book a test drive from any vehicle’s details.',
        }}
      >
        {(items) => (
          <ul aria-label="Enquiries" className="divide-y divide-slate-100">
            {items.map((enquiry) => (
              <EnquiryRow key={enquiry.id} enquiry={enquiry} />
            ))}
          </ul>
        )}
      </Section>
    </div>
  )
}
