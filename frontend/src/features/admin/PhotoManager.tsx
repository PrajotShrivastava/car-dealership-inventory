import { ImagePlus, Trash2 } from 'lucide-react'
import { useId, useState, type ChangeEvent } from 'react'
import { ApiError, mediaUrl } from '../../api/client'
import type { Vehicle, VehiclePhoto } from '../../api/types'
import { Alert } from '../../components/Alert'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { Spinner } from '../../components/Spinner'
import { useDeletePhoto, useUploadPhotos } from '../inventory/queries'
import { MAX_PHOTO_MB, MAX_PHOTOS, PHOTO_ACCEPT, photoProblem } from './photoRules'

const message = (error: unknown) => (error instanceof ApiError ? error.message : 'Something went wrong. Please try again.')

/** Edit tab: photos upload and delete immediately, separately from the vehicle's details form. */
export function PhotoManager({ vehicle }: { vehicle: Vehicle }) {
  const inputId = useId()
  const upload = useUploadPhotos()
  const remove = useDeletePhoto(vehicle.id)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<VehiclePhoto | null>(null)
  const count = vehicle.photos.length

  function add(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    const problem = photoProblem(files, count)
    setError(problem)
    if (!problem && files.length) {
      upload.mutate({ id: vehicle.id, files }, { onError: (err) => setError(message(err)) })
    }
  }

  return (
    <section aria-labelledby={`${inputId}-title`} className="space-y-3 border-t border-slate-200 px-6 py-5">
      <div className="flex items-center justify-between">
        <h3 id={`${inputId}-title`} className="text-sm font-semibold text-slate-900">
          Photos
        </h3>
        <span className="text-xs text-slate-500 tabular-nums">
          {count} of {MAX_PHOTOS} photos
        </span>
      </div>
      {error && <Alert>{error}</Alert>}
      {count > 0 && (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {vehicle.photos.map((photo, index) => (
            <li key={photo.id} className="group relative overflow-hidden rounded-md border border-slate-200">
              <img
                src={mediaUrl(photo.thumb_url)}
                alt={`Photo ${index + 1}${index === 0 ? ' (cover)' : ''}`}
                loading="lazy"
                className="aspect-[4/3] w-full object-cover"
              />
              {index === 0 && (
                <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
                  Cover
                </span>
              )}
              <button
                type="button"
                aria-label={`Remove photo ${index + 1}`}
                onClick={() => setConfirming(photo)}
                className="absolute top-1 right-1 rounded-full bg-black/60 p-1 text-white hover:bg-red-600"
              >
                <Trash2 aria-hidden className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <input
        id={inputId}
        type="file"
        multiple
        accept={PHOTO_ACCEPT}
        disabled={count >= MAX_PHOTOS || upload.isPending}
        onChange={add}
        aria-label="Add photos"
        className="peer sr-only"
      />
      <label
        htmlFor={inputId}
        aria-hidden
        className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-slate-300 px-3 py-3 text-sm text-slate-600 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500/40 peer-disabled:cursor-not-allowed peer-disabled:opacity-50 hover:border-brand-500 hover:text-brand-700"
      >
        {upload.isPending ? <Spinner /> : <ImagePlus aria-hidden className="size-4" />}
        {upload.isPending ? 'Uploading…' : count >= MAX_PHOTOS ? 'Photo limit reached' : 'Add photos'}
      </label>
      <p className="text-xs text-slate-500">
        JPEG, PNG or WebP, up to {MAX_PHOTO_MB} MB each. Changes to photos are saved immediately.
      </p>
      {confirming && (
        <ConfirmDialog
          title="Remove this photo?"
          confirmLabel="Remove"
          busy={remove.isPending}
          onCancel={() => setConfirming(null)}
          onConfirm={() =>
            remove.mutate(confirming.id, {
              onSuccess: () => setConfirming(null),
              onError: (err) => {
                setConfirming(null)
                setError(message(err))
              },
            })
          }
        >
          The photo is deleted permanently.
        </ConfirmDialog>
      )}
    </section>
  )
}
