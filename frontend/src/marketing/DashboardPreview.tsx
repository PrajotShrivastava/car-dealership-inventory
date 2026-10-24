import { CarFront, ShoppingCart } from 'lucide-react'
import type { Vehicle } from '../api/types'
import { formatPrice, specLine, vehicleTitle } from '../features/inventory/format'
import { StockBadge } from '../features/inventory/StockBadge'
import { CarIllustration } from '../components/CarIllustration'

// Illustrative sample rows; not live data.
const SAMPLE: (Omit<Vehicle, 'photos'> & { paint: string })[] = [
  { id: 1, make: 'Ford', model: 'Kuga', trim: 'ST-Line', year: 2024, category: 'suv', fuel_type: 'hybrid', transmission: 'automatic', price: '35990.00', quantity: 6, paint: '#a8adb4' },
  { id: 2, make: 'Tesla', model: 'Model 3', trim: 'Long Range', year: 2025, category: 'sedan', fuel_type: 'electric', transmission: 'automatic', price: '42990.00', quantity: 2, paint: '#f4f4f5' },
  { id: 3, make: 'Ford', model: 'Ranger', trim: 'Wildtrak', year: 2024, category: 'truck', fuel_type: 'diesel', transmission: 'automatic', price: '44800.00', quantity: 3, paint: '#3f4650' },
  { id: 4, make: 'BMW', model: '4 Series', trim: 'M Sport', year: 2024, category: 'convertible', fuel_type: 'petrol', transmission: 'automatic', price: '58900.00', quantity: 0, paint: '#b4232a' },
]

export function DashboardPreview() {
  const featured = SAMPLE[0]!
  return (
    <figure aria-label="Dashboard preview" className="relative">
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl shadow-ink-900/20 ring-1 ring-slate-900/5">
        {/* window chrome */}
        <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2.5">
          <span className="size-2.5 rounded-full bg-red-400" />
          <span className="size-2.5 rounded-full bg-amber-400" />
          <span className="size-2.5 rounded-full bg-emerald-400" />
          <span className="ml-3 truncate rounded bg-white px-3 py-0.5 text-[11px] text-slate-400 ring-1 ring-slate-200">
            drivestock / app
          </span>
          <span className="ml-auto rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-brand-700 uppercase">
            Sample data
          </span>
        </div>
        <div className="flex">
          <div aria-hidden className="hidden w-40 shrink-0 bg-ink-900 p-3 sm:block">
            <div className="flex items-center gap-2 px-1 py-1.5">
              <span className="flex size-6 items-center justify-center rounded bg-brand-500 text-on-brand">
                <CarFront className="size-3.5" />
              </span>
              <span className="text-xs font-bold text-on-accent">DriveStock</span>
            </div>
            <div className="mt-4 rounded bg-ink-800 px-2 py-1.5 text-[11px] font-medium text-on-accent shadow-[inset_2px_0_0_var(--color-brand-500)]">
              Vehicles
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <p className="text-sm font-semibold text-slate-900">
                Vehicles <span className="font-normal text-slate-500">(4)</span>
              </p>
              <span className="rounded border border-slate-200 px-2 py-1 text-[11px] text-slate-500">Newest first</span>
            </div>
            <ul className="divide-y divide-slate-200">
              {SAMPLE.map((vehicle) => (
                <li key={vehicle.id} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="hidden h-11 w-16 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-gradient-to-b from-slate-50 to-slate-100 px-1 sm:flex">
                    <CarIllustration category={vehicle.category} paint={vehicle.paint} className="w-full" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold text-slate-900">{vehicleTitle(vehicle)}</p>
                    <p className="truncate text-[11px] text-slate-500">{specLine(vehicle).join(' • ')}</p>
                  </div>
                  <StockBadge quantity={vehicle.quantity} className="hidden md:inline-flex" />
                  <p className="w-20 text-right text-[13px] font-semibold text-slate-900 tabular-nums">
                    {formatPrice(vehicle.price)}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* floating details card */}
      <div
        aria-hidden
        className="animate-float absolute -bottom-12 -left-10 hidden w-60 rounded-xl border border-slate-200 bg-white p-4 shadow-xl lg:block xl:-left-16"
      >
        <div className="-mx-1 mb-3 flex h-20 items-end justify-center rounded-lg bg-gradient-to-b from-slate-50 to-slate-100 px-3 pb-1">
          <CarIllustration category={featured.category} paint={featured.paint} className="w-full" />
        </div>
        <p className="text-xs text-slate-500">{featured.trim} · {featured.year}</p>
        <p className="text-sm font-semibold text-slate-900">{vehicleTitle(featured)}</p>
        <div className="mt-3 flex items-center justify-between">
          <p className="text-lg font-semibold text-slate-900">{formatPrice(featured.price)}</p>
          <StockBadge quantity={featured.quantity} />
        </div>
        <div className="mt-3 flex h-8 items-center justify-center gap-1.5 rounded-md bg-brand-600 text-xs font-medium text-on-brand">
          <ShoppingCart className="size-3.5" /> Purchase
        </div>
      </div>
      <figcaption className="sr-only">Illustration of the DriveStock inventory screen.</figcaption>
    </figure>
  )
}
