import type { Vehicle } from '../../api/types'
import { formatPrice, titleCase } from './format'
import { PhotoGallery } from './PhotoGallery'
import { StockBadge } from './StockBadge'

export function VehicleDetails({ vehicle }: { vehicle: Vehicle }) {
  const specs: [string, string][] = [
    ['Make', vehicle.make],
    ['Model', vehicle.model],
    ['Trim', vehicle.trim ?? '—'],
    ['Year', String(vehicle.year)],
    ['Category', titleCase(vehicle.category)],
    ['Fuel', titleCase(vehicle.fuel_type)],
    ['Transmission', titleCase(vehicle.transmission)],
    ['Units in stock', String(vehicle.quantity)],
  ]
  return (
    <div className="space-y-6 px-6 py-5">
      <PhotoGallery vehicle={vehicle} />
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">Price</p>
          <p className="text-2xl font-semibold text-slate-900 tabular-nums">{formatPrice(vehicle.price)}</p>
        </div>
        <StockBadge quantity={vehicle.quantity} />
      </div>
      <section>
        <h3 className="mb-3 text-sm font-semibold text-slate-900">Specifications</h3>
        <dl className="grid grid-cols-2 overflow-hidden rounded-lg border border-slate-200">
          {specs.map(([label, value], index) => (
            <div
              key={label}
              className={`px-4 py-3 ${index % 2 === 0 ? 'border-r' : ''} ${index < specs.length - 2 ? 'border-b' : ''} border-slate-200`}
            >
              <dt className="text-xs text-slate-500">{label}</dt>
              <dd className="mt-0.5 text-sm font-medium text-slate-900">{value}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  )
}
