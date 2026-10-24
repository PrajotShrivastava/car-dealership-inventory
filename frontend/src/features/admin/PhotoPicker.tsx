import { ImagePlus, X } from 'lucide-react'
import { useEffect, useId, useMemo, useState, type ChangeEvent } from 'react'
import { MAX_PHOTO_MB, MAX_PHOTOS, PHOTO_ACCEPT, photoProblem } from './photoRules'

/** Chooses photos to upload with a new vehicle, with local previews. Nothing is sent until save. */
export function PhotoPicker({ files, onChange }: { files: File[]; onChange: (files: File[]) => void }) {
  const id = useId()
  const [error, setError] = useState<string | null>(null)
  const previews = useMemo(() => files.map((file) => URL.createObjectURL(file)), [files])
  useEffect(() => () => previews.forEach((url) => URL.revokeObjectURL(url)), [previews])

  function add(event: ChangeEvent<HTMLInputElement>) {
    const chosen = Array.from(event.target.files ?? [])
    event.target.value = '' // lets the same file be chosen again after removing it
    const problem = photoProblem(chosen, files.length)
    setError(problem)
    if (!problem) onChange([...files, ...chosen])
  }

  const full = files.length >= MAX_PHOTOS
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label htmlFor={id} className="block text-[13px] font-medium text-slate-700">
          Photos (optional)
        </label>
        <span className="text-xs text-slate-500 tabular-nums">
          {files.length} of {MAX_PHOTOS}
        </span>
      </div>
      {files.length > 0 && (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {files.map((file, index) => (
            <li key={`${index}-${file.name}`} className="relative overflow-hidden rounded-md border border-slate-200">
              <img src={previews[index]} alt="" className="aspect-[4/3] w-full object-cover" />
              <p className="truncate px-1.5 py-1 text-[11px] text-slate-600">{file.name}</p>
              <button
                type="button"
                aria-label={`Remove ${file.name}`}
                onClick={() => onChange(files.filter((_, i) => i !== index))}
                className="absolute top-1 right-1 rounded-full bg-black/60 p-0.5 text-white hover:bg-black/80"
              >
                <X aria-hidden className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <input id={id} type="file" multiple accept={PHOTO_ACCEPT} disabled={full} onChange={add} className="peer sr-only" />
      <label
        htmlFor={id}
        aria-hidden
        className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-slate-300 px-3 py-3 text-sm text-slate-600 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500/40 peer-disabled:cursor-not-allowed peer-disabled:opacity-50 hover:border-brand-500 hover:text-brand-700"
      >
        <ImagePlus aria-hidden className="size-4" />
        Choose photos
      </label>
      {error ? (
        <p className="text-xs text-red-600">{error}</p>
      ) : (
        <p className="text-xs text-slate-500">
          JPEG, PNG or WebP, up to {MAX_PHOTO_MB} MB each. The first photo is the cover.
        </p>
      )}
    </div>
  )
}
