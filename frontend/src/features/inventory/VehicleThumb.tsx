import type { Category } from '../../api/types'
import { CarIllustration } from '../../components/CarIllustration'
import { cn } from '../../components/cn'

/**
 * Placeholder image for a vehicle: a neutral drawing of its body style. Vehicle photos
 * are not stored, so this is always shown; the large size adds a "No photo available" note.
 */
export function VehicleThumb({ category, size = 'md' }: { category: Category; size?: 'md' | 'lg' }) {
  return (
    <div
      data-testid="vehicle-photo-fallback"
      className={cn(
        'flex shrink-0 flex-col items-center justify-center overflow-hidden rounded-md border border-slate-200 bg-gradient-to-b from-slate-50 to-slate-100 px-2',
        size === 'md' ? 'h-14 w-20' : 'h-40 w-full',
      )}
    >
      <CarIllustration category={category} className={size === 'md' ? 'w-full' : 'w-48'} />
      {size === 'lg' && <p className="mt-1 text-xs text-slate-500">No photo available</p>}
    </div>
  )
}
