import { Link } from 'react-router'
import type { RecentSale } from '../../api/types'
import { APP_SALES } from '../../paths'
import { formatPrice } from '../inventory/format'
import { formatCount, formatDateTime } from './format'
import { Panel, PanelEmpty } from './Panel'

export function RecentSales({ sales }: { sales: RecentSale[] }) {
  return (
    <Panel
      title="Recent sales"
      description="Your latest completed sales, at the price paid"
      actions={
        <Link to={APP_SALES} className="text-sm font-medium text-brand-600 hover:underline">
          View all sales
        </Link>
      }
    >
      {sales.length === 0 ? (
        <PanelEmpty title="No sales recorded yet.">Purchases of your vehicles will be listed here.</PanelEmpty>
      ) : (
        <div className="-mx-5 sm:-mx-6">
          <table className="w-full text-left text-sm">
            <thead className="border-y border-slate-200 bg-slate-50/60 text-xs font-medium text-slate-500">
              <tr>
                <th scope="col" className="hidden px-6 py-2.5 font-medium sm:table-cell">Date</th>
                <th scope="col" className="py-2.5 pr-3 pl-5 font-medium sm:pl-3">Vehicle</th>
                <th scope="col" className="px-3 py-2.5 text-right font-medium">Qty</th>
                <th scope="col" className="py-2.5 pr-5 pl-3 text-right font-medium sm:pr-3">Total</th>
                <th scope="col" className="hidden px-6 py-2.5 text-right font-medium sm:table-cell">Reference</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sales.map((sale) => (
                <tr key={sale.id}>
                  <td className="hidden px-6 py-3 whitespace-nowrap text-slate-600 sm:table-cell">{formatDateTime(sale.created_at)}</td>
                  <td className="py-3 pr-3 pl-5 sm:pl-3">
                    <p className="font-medium text-slate-900">{sale.vehicle_label}</p>
                    {sale.customer_name && (
                      <p className="text-xs text-slate-500">
                        {sale.customer_name}
                        {sale.channel === 'online' ? ' · Online' : ''}
                      </p>
                    )}
                    {sale.vehicle_id === null && <p className="text-xs text-slate-500">Removed from inventory</p>}
                    {/* Small screens: date and reference move under the vehicle. */}
                    <p className="text-xs text-slate-500 sm:hidden">
                      {formatDateTime(sale.created_at)} · #{sale.id}
                    </p>
                    {sale.quantity > 1 && (
                      <p className="text-xs text-slate-500">{formatPrice(sale.unit_price)} each</p>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right text-slate-900 tabular-nums">{formatCount(sale.quantity)}</td>
                  <td className="py-3 pr-5 pl-3 text-right font-semibold whitespace-nowrap text-slate-900 tabular-nums sm:pr-3">
                    {formatPrice(sale.total_price)}
                  </td>
                  <td className="hidden px-6 py-3 text-right text-slate-500 tabular-nums sm:table-cell">#{sale.id}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  )
}
