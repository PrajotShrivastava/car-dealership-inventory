import { Bus, Car, CarFront, Truck, type LucideIcon } from 'lucide-react'
import type { Category } from '../../api/types'
import { cn } from '../../components/cn'

const ICONS: Record<Category, LucideIcon> = {
  sedan: Car,
  suv: CarFront,
  hatchback: Car,
  coupe: Car,
  convertible: Car,
  truck: Truck,
  van: Bus,
  wagon: Car,
}

/** Neutral placeholder: vehicle images are out of scope, so show a category icon. */
export function VehicleThumb({ category, size = 'md' }: { category: Category; size?: 'md' | 'lg' }) {
  const Icon = ICONS[category]
  return (
    <div
      aria-hidden
      className={cn(
        'flex shrink-0 items-center justify-center rounded-md border border-slate-200 bg-gradient-to-br from-slate-50 to-slate-100 text-slate-400',
        size === 'md' ? 'h-14 w-20' : 'h-40 w-full',
      )}
    >
      <Icon className={size === 'md' ? 'size-7' : 'size-16'} strokeWidth={1.5} />
    </div>
  )
}
