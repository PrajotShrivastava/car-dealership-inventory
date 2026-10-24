// Mirrors the API's limits so admins get instant feedback; the API still enforces them.
export const MAX_PHOTOS = 10
export const MAX_PHOTO_MB = 5
const MAX_PHOTO_BYTES = MAX_PHOTO_MB * 1024 * 1024
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp']
export const PHOTO_ACCEPT = PHOTO_TYPES.join(',')

/** The first problem with adding `files` to a vehicle that already has `existing` photos. */
export function photoProblem(files: File[], existing: number): string | null {
  for (const file of files) {
    if (!PHOTO_TYPES.includes(file.type)) return `${file.name} is not a JPEG, PNG or WebP image.`
    if (file.size > MAX_PHOTO_BYTES) return `${file.name} is larger than ${MAX_PHOTO_MB} MB.`
  }
  if (existing + files.length > MAX_PHOTOS) {
    return `You can add up to ${MAX_PHOTOS} photos per vehicle (${MAX_PHOTOS - existing} more).`
  }
  return null
}
