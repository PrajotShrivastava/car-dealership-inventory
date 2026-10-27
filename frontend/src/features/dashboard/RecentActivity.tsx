import { PackagePlus, ShoppingBag } from 'lucide-react'
import type { Dashboard } from '../../api/types'
import { formatPrice } from '../inventory/format'
import { formatShortDate, vehicleLabel } from './format'
import { Panel, PanelEmpty } from './Panel'

const MAX_ITEMS = 6

/** Only events the data records reliably: new listings and completed sales. */
export function RecentActivity({ data }: { data: Dashboard }) {
  const events = [
    ...data.recent_sales.map((sale) => ({
      key: `sale-${sale.id}`,
      at: sale.created_at,
      icon: ShoppingBag,
      text: `Sold ${sale.quantity} × ${sale.vehicle_label}`,
      detail: formatPrice(sale.total_price),
    })),
    ...data.recent_listings.map((vehicle) => ({
      key: `listing-${vehicle.id}`,
      at: vehicle.created_at,
      icon: PackagePlus,
      text: `Listed ${vehicleLabel(vehicle)}`,
      detail: formatPrice(vehicle.price),
    })),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, MAX_ITEMS)

  return (
    <Panel title="Recent activity" description="New listings and completed sales">
      {events.length === 0 ? (
        <PanelEmpty title="Nothing yet">Activity appears when you list or sell vehicles.</PanelEmpty>
      ) : (
        <ol className="space-y-4">
          {events.map(({ key, at, icon: Icon, text, detail }) => (
            <li key={key} className="flex gap-3">
              <span aria-hidden className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                <Icon className="size-3.5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-slate-900">{text}</p>
                <p className="text-xs text-slate-500">
                  {formatShortDate(at)} · {detail}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  )
}
