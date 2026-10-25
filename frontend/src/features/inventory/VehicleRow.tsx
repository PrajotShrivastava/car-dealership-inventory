import { Info } from 'lucide-react'
import type { ReactNode } from 'react'
import type { Vehicle } from '../../api/types'
import { Button } from '../../components/Button'
import { formatPrice, specLine, vehicleTitle } from './format'
import { StockBadge } from './StockBadge'
import { VehicleThumb } from './VehicleThumb'

// Rows follow the width of the list (an @container), not the window, because the sidebar and
// filter column change how much room it has: stacked card when narrow, one-line card from @2xl,
// a table from 52rem (832px).
//
// In table mode the list is one CSS grid (TABLE_GRID) and the header and every row are subgrids
// of it (ROW_GRID), so all columns line up. Vehicle gets room first (up to 22rem, so Year stays
// close to it on wide screens); Year, Availability and Price are at least as wide as their widest
// value (the longest price always fits) and share the rest; the button column fits the button.
export const TABLE_GRID =
  '@[52rem]:grid @[52rem]:grid-cols-[minmax(14rem,22rem)_minmax(max-content,1fr)_minmax(max-content,1fr)_minmax(max-content,1fr)_max-content]'
export const ROW_GRID =
  '@[52rem]:col-span-full @[52rem]:grid @[52rem]:grid-cols-subgrid @[52rem]:items-center @[52rem]:gap-x-5'

export function VehicleRow({ vehicle, onView, actions }: { vehicle: Vehicle; onView: () => void; actions?: ReactNode }) {
  return (
    <li className={`flex flex-col gap-4 px-4 py-5 sm:px-6 @2xl:flex-row @2xl:items-center @2xl:gap-6 ${ROW_GRID}`}>
      <div className="flex min-w-0 items-center gap-5 @2xl:flex-1">
        <VehicleThumb
          category={vehicle.category}
          photo={vehicle.photos[0]}
          alt={`${vehicle.year} ${vehicle.make} ${vehicle.model}`}
        />
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-slate-900">{vehicleTitle(vehicle)}</h3>
          {vehicle.trim && <p className="mt-0.5 truncate text-[13px] text-slate-500">{vehicle.trim}</p>}
          <p className="mt-1.5 truncate text-xs text-slate-500">
            <span className="@[52rem]:hidden">{vehicle.year} • </span>
            {specLine(vehicle).join(' • ')}
          </p>
        </div>
      </div>
      <p className="hidden text-sm text-slate-700 tabular-nums @[52rem]:block">{vehicle.year}</p>
      {/* Badge and price share a row in card layouts; @[52rem]:contents makes them two table cells. */}
      <div className="flex items-center justify-between gap-3 @2xl:shrink-0 @2xl:gap-6 @[52rem]:contents">
        <div>
          <StockBadge quantity={vehicle.quantity} />
        </div>
        <p className="text-sm font-semibold text-slate-900 whitespace-nowrap tabular-nums @2xl:min-w-24 @2xl:text-right">{formatPrice(vehicle.price)}</p>
      </div>
      <div className="flex items-center justify-end gap-2 @2xl:shrink-0">
        {actions}
        <Button size="sm" icon={<Info aria-hidden className="size-3.5" />} onClick={onView}>
          View details
        </Button>
      </div>
    </li>
  )
}
