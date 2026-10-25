import { useState } from 'react'
import { mediaUrl } from '../../api/client'
import type { Vehicle } from '../../api/types'
import { cn } from '../../components/cn'
import { VehicleThumb } from './VehicleThumb'

/** Main photo plus a row of thumbnails to switch between them. */
export function PhotoGallery({ vehicle }: { vehicle: Vehicle }) {
  const [index, setIndex] = useState(0)
  const { photos } = vehicle
  const name = `${vehicle.year} ${vehicle.make} ${vehicle.model}`
  const current = photos[Math.min(index, photos.length - 1)]
  const label = (i: number) => `photo ${i + 1} of ${photos.length}`

  return (
    <div className="space-y-2">
      <VehicleThumb
        key={current?.id}
        category={vehicle.category}
        photo={current}
        alt={photos.length > 1 ? `${name}, ${label(index)}` : name}
        size="lg"
      />
      {photos.length > 1 && (
        <ul className="flex gap-2 overflow-x-auto pb-1">
          {photos.map((photo, i) => (
            <li key={photo.id} className="shrink-0">
              <button
                type="button"
                aria-label={`Show ${label(i)}`}
                aria-pressed={i === index}
                onClick={() => setIndex(i)}
                className={cn(
                  'block overflow-hidden rounded-md border-2',
                  i === index ? 'border-brand-600' : 'border-transparent opacity-70 hover:opacity-100',
                )}
              >
                <img src={mediaUrl(photo.thumb_url)} alt="" loading="lazy" className="h-12 w-16 object-cover" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
