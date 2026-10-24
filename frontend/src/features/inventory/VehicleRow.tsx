import { Info } from 'lucide-react'
import type { ReactNode } from 'react'
import type { Vehicle } from '../../api/types'
import { Button } from '../../components/Button'
import { formatPrice, specLine, vehicleTitle } from './format'
import { StockBadge } from './StockBadge'
import { VehicleThumb } from './VehicleThumb'

export const ROW_GRID = 'md:grid md:grid-cols-[minmax(0,2.4fr)_70px_minmax(0,1fr)_minmax(0,0.9fr)_auto] md:items-center md:gap-4'

export function VehicleRow({ vehicle, onView, actions }: { vehicle: Vehicle; onView: () => void; actions?: ReactNode }) {
  return (
    <li className={`flex flex-col gap-3 px-4 py-4 sm:px-5 ${ROW_GRID}`}>
      <div className="flex min-w-0 items-center gap-4">
        <VehicleThumb category={vehicle.category} />
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-slate-900">{vehicleTitle(vehicle)}</h3>
          {vehicle.trim && <p className="truncate text-[13px] text-slate-500">{vehicle.trim}</p>}
          <p className="mt-1 truncate text-xs text-slate-500">
            <span className="md:hidden">{vehicle.year} • </span>
            {specLine(vehicle).join(' • ')}
          </p>
        </div>
      </div>
      <p className="hidden text-sm text-slate-700 tabular-nums md:block">{vehicle.year}</p>
      {/* One flex row on mobile; md:contents lets both children become grid cells on desktop. */}
      <div className="flex items-center justify-between gap-3 md:contents">
        <div>
          <StockBadge quantity={vehicle.quantity} />
        </div>
        <p className="text-sm font-semibold text-slate-900 tabular-nums md:text-right">{formatPrice(vehicle.price)}</p>
      </div>
      <div className="flex items-center justify-end gap-2">
        {actions}
        <Button size="sm" icon={<Info aria-hidden className="size-3.5" />} onClick={onView}>
          View details
        </Button>
      </div>
    </li>
  )
}
