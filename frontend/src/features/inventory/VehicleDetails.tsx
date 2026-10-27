import type { Vehicle } from '../../api/types'
import { CONDITION_LABELS, formatMileage, formatPrice, titleCase } from './format'
import { PhotoGallery } from './PhotoGallery'
import { StockBadge } from './StockBadge'

export function VehicleDetails({ vehicle }: { vehicle: Vehicle }) {
  const specs: [string, string][] = [
    ['Condition', CONDITION_LABELS[vehicle.condition]],
    ['Mileage', vehicle.mileage != null ? formatMileage(vehicle.mileage) : '—'],
    ['Make', vehicle.make],
    ['Model', vehicle.model],
    ['Trim', vehicle.trim ?? '—'],
    ['Year', String(vehicle.year)],
    ['Category', titleCase(vehicle.category)],
    ['Fuel', titleCase(vehicle.fuel_type)],
    ['Transmission', titleCase(vehicle.transmission)],
    ['Colour', vehicle.colour ?? '—'],
    ['VIN', vehicle.vin ?? '—'],
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
              <dd className="mt-0.5 text-sm font-medium break-all text-slate-900">{value}</dd>
            </div>
          ))}
        </dl>
      </section>
      {vehicle.features.length > 0 && (
        <section>
          <h3 className="mb-3 text-sm font-semibold text-slate-900">Features</h3>
          <ul aria-label="Features" className="flex flex-wrap gap-2">
            {vehicle.features.map((feature) => (
              <li key={feature} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700">
                {feature}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
