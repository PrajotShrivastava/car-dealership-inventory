import { useState } from 'react'
import { mediaUrl } from '../../api/client'
import type { Category, VehiclePhoto } from '../../api/types'
import { CarIllustration } from '../../components/CarIllustration'
import { cn } from '../../components/cn'

const frame = 'shrink-0 overflow-hidden rounded-md border border-slate-200'
// Photos get more room in the drawer than the drawing does.
const photoSizes = { md: 'h-14 w-20', lg: 'h-56 w-full' }
const drawingSizes = { md: 'h-14 w-20', lg: 'h-40 w-full' }

/**
 * A vehicle's photo, or a neutral drawing of its body style when it has none (or the
 * photo fails to load). The large size uses the full image, the list uses the thumbnail.
 */
export function VehicleThumb({
  category,
  photo,
  alt = '',
  size = 'md',
}: {
  category: Category
  photo?: VehiclePhoto
  alt?: string
  size?: 'md' | 'lg'
}) {
  const [failed, setFailed] = useState<string | null>(null)
  const src = photo && mediaUrl(size === 'md' ? photo.thumb_url : photo.url)

  if (src && failed !== src) {
    return (
      <img
        src={src}
        alt={alt}
        loading="lazy"
        onError={() => setFailed(src)}
        className={cn(frame, photoSizes[size], 'bg-slate-100 object-cover')}
      />
    )
  }
  return (
    <div
      data-testid="vehicle-photo-fallback"
      className={cn(
        frame,
        drawingSizes[size],
        'flex flex-col items-center justify-center bg-gradient-to-b from-slate-50 to-slate-100 px-2',
      )}
    >
      <CarIllustration category={category} className={size === 'md' ? 'w-full' : 'w-48'} />
      {size === 'lg' && <p className="mt-1 text-xs text-slate-500">No photo available</p>}
    </div>
  )
}
