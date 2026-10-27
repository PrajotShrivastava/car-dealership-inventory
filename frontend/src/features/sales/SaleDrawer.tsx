import { Download } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { ApiError } from '../../api/client'
import { Alert } from '../../components/Alert'
import { Button } from '../../components/Button'
import { Drawer } from '../../components/Drawer'
import { Spinner } from '../../components/Spinner'
import { APP_LEADS } from '../../paths'
import { viewerTimeZone } from '../../time'
import { formatPrice } from '../inventory/format'
import { channelLabel, formatSaleDate, moneyOrDash } from './format'
import { downloadInvoice, useSale } from './queries'

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-2">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right font-medium text-slate-900 tabular-nums">{children}</dd>
    </div>
  )
}

export function SaleDrawer({ id, onClose }: { id: number; onClose: () => void }) {
  const { data: sale, isError, error } = useSale(id)
  const [downloading, setDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState<string | null>(null)

  async function download() {
    setDownloading(true)
    setDownloadError(null)
    try {
      await downloadInvoice(id, viewerTimeZone())
    } catch (cause) {
      setDownloadError(cause instanceof ApiError ? cause.message : 'Could not download the invoice.')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <Drawer
      title={`Sale #${id}`}
      subtitle={sale ? `${formatSaleDate(sale.sold_at)} · ${channelLabel(sale)}` : undefined}
      onClose={onClose}
      footer={
        sale && (
          <div className="space-y-2">
            {downloadError && <Alert>{downloadError}</Alert>}
            <Button className="w-full" icon={<Download aria-hidden className="size-4" />} loading={downloading} onClick={download}>
              Download invoice
            </Button>
          </div>
        )
      }
    >
      {isError ? (
        <div className="p-6">
          <Alert>{error.message}</Alert>
        </div>
      ) : !sale ? (
        <div className="flex justify-center p-10">
          <Spinner />
        </div>
      ) : (
        <div className="space-y-6 px-6 py-5 text-sm">
          <section>
            <h3 className="text-xs font-medium tracking-wide text-slate-500 uppercase">Vehicle</h3>
            <p className="mt-1 font-medium text-slate-900">{sale.vehicle_label}</p>
            {sale.vehicle_id === null && <p className="text-xs text-slate-500">Removed from inventory</p>}
          </section>
          <section>
            <h3 className="text-xs font-medium tracking-wide text-slate-500 uppercase">Customer</h3>
            <p className="mt-1 font-medium text-slate-900">{sale.customer.name ?? '—'}</p>
            {sale.customer.email && <p className="text-slate-600">{sale.customer.email}</p>}
            {sale.customer.phone && <p className="text-slate-600">{sale.customer.phone}</p>}
            {sale.lead_id && (
              <Link to={`${APP_LEADS}?lead=${sale.lead_id}`} className="mt-1 inline-block text-brand-600 hover:underline">
                View lead
              </Link>
            )}
          </section>
          <dl className="divide-y divide-slate-100 rounded-md border border-slate-200 px-4">
            <Row label="Quantity">{sale.quantity}</Row>
            <Row label="Selling price per unit">{formatPrice(sale.unit_price)}</Row>
            <Row label="Revenue">{formatPrice(sale.total_price)}</Row>
            <Row label="Acquisition cost per unit">{moneyOrDash(sale.unit_cost)}</Row>
            <Row label="Gross profit">
              {sale.gross_profit === null ? <span className="font-normal text-slate-500">— (no cost recorded)</span> : formatPrice(sale.gross_profit)}
            </Row>
          </dl>
          <p className="text-xs text-slate-500">
            Revenue is what the customer paid. Gross profit is revenue minus acquisition cost, and is never shown on the invoice.
          </p>
        </div>
      )}
    </Drawer>
  )
}
