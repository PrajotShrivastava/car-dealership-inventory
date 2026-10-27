import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import type { Vehicle, VehicleQuery } from '../../api/types'
import { vehiclesApi } from '../../api/vehicles'

export const vehicleKeys = {
  all: ['vehicles'] as const,
  list: (query: VehicleQuery) => ['vehicles', 'list', query] as const,
  detail: (id: number) => ['vehicles', 'detail', id] as const,
}

export function useVehicleSearch(query: VehicleQuery) {
  return useQuery({
    queryKey: vehicleKeys.list(query),
    queryFn: ({ signal }) => vehiclesApi.search(query, signal),
    placeholderData: keepPreviousData,
  })
}

export function useVehicle(id: number | null, initial?: Vehicle) {
  return useQuery({
    queryKey: vehicleKeys.detail(id ?? -1),
    queryFn: () => vehiclesApi.get(id!),
    enabled: id !== null,
    initialData: initial,
  })
}

/** Lists and the dealer dashboard both summarise vehicles, so any change refreshes them. */
function refreshSummaries(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ['vehicles', 'list'] }),
    queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
  ])
}

/** After any stock or catalogue change: update the detail cache and refetch lists. */
export function useSyncVehicle() {
  const queryClient = useQueryClient()
  return (vehicle: Vehicle) => {
    queryClient.setQueryData(vehicleKeys.detail(vehicle.id), vehicle)
    return refreshSummaries(queryClient)
  }
}

export function usePurchase() {
  const sync = useSyncVehicle()
  return useMutation({
    mutationFn: ({ id, quantity }: { id: number; quantity: number }) => vehiclesApi.purchase(id, quantity),
    onSuccess: (result) => sync(result.vehicle),
  })
}

export function useEnquire(id: number) {
  return useMutation({
    mutationFn: (body: Parameters<typeof vehiclesApi.enquire>[1]) => vehiclesApi.enquire(id, body),
  })
}

export function useCreateVehicle() {
  const sync = useSyncVehicle()
  return useMutation({ mutationFn: vehiclesApi.create, onSuccess: sync })
}

export function useUpdateVehicle(id: number) {
  const sync = useSyncVehicle()
  return useMutation({
    mutationFn: (body: Parameters<typeof vehiclesApi.update>[1]) => vehiclesApi.update(id, body),
    onSuccess: sync,
  })
}

export function useRestock(id: number) {
  const sync = useSyncVehicle()
  return useMutation({ mutationFn: (quantity: number) => vehiclesApi.restock(id, quantity), onSuccess: sync })
}

export function useUploadPhotos() {
  const sync = useSyncVehicle()
  return useMutation({
    mutationFn: ({ id, files }: { id: number; files: File[] }) => vehiclesApi.uploadPhotos(id, files),
    onSuccess: sync,
  })
}

export function useDeletePhoto(id: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (photoId: number) => vehiclesApi.deletePhoto(id, photoId),
    onSuccess: (_, photoId) => {
      queryClient.setQueryData<Vehicle>(vehicleKeys.detail(id), (vehicle) =>
        vehicle && { ...vehicle, photos: vehicle.photos.filter((photo) => photo.id !== photoId) },
      )
      return refreshSummaries(queryClient)
    },
  })
}

export function useDeleteVehicle() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => vehiclesApi.remove(id),
    onSuccess: (_, id) => {
      queryClient.removeQueries({ queryKey: vehicleKeys.detail(id) })
      return refreshSummaries(queryClient)
    },
  })
}
