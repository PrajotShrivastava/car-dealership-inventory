import { apiFetch } from './client'
import type {
  PurchaseResult,
  Vehicle,
  VehicleCreate,
  VehicleFields,
  VehicleList,
  VehicleQuery,
} from './types'

export const vehiclesApi = {
  search: (query: VehicleQuery, signal?: AbortSignal) =>
    apiFetch<VehicleList>('/vehicles/search', { query: { ...query }, signal }),
  get: (id: number) => apiFetch<Vehicle>(`/vehicles/${id}`),
  create: (body: VehicleCreate) => apiFetch<Vehicle>('/vehicles', { method: 'POST', body }),
  update: (id: number, body: VehicleFields) =>
    apiFetch<Vehicle>(`/vehicles/${id}`, { method: 'PUT', body }),
  remove: (id: number) => apiFetch<void>(`/vehicles/${id}`, { method: 'DELETE' }),
  purchase: (id: number, quantity = 1) =>
    apiFetch<PurchaseResult>(`/vehicles/${id}/purchase`, { method: 'POST', body: { quantity } }),
  restock: (id: number, quantity: number) =>
    apiFetch<Vehicle>(`/vehicles/${id}/restock`, { method: 'POST', body: { quantity } }),
  uploadPhotos: (id: number, files: File[]) => {
    const body = new FormData()
    for (const file of files) body.append('files', file)
    return apiFetch<Vehicle>(`/vehicles/${id}/photos`, { method: 'POST', body })
  },
  deletePhoto: (id: number, photoId: number) =>
    apiFetch<void>(`/vehicles/${id}/photos/${photoId}`, { method: 'DELETE' }),
}
