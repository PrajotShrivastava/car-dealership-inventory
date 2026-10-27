import type { Vehicle, VehicleCondition } from '../../api/types'

const wholeDollars = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})
const withCents = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

/** Prices arrive as fixed-point strings ("35990.00"); show cents only when non-zero. */
export function formatPrice(value: string | number): string {
  const amount = Number(value)
  return Number.isInteger(amount) ? wholeDollars.format(amount) : withCents.format(amount)
}

export type StockLevel = 'in' | 'low' | 'out'

export const LOW_STOCK_THRESHOLD = 2

export function stockLevel(quantity: number): StockLevel {
  if (quantity <= 0) return 'out'
  return quantity <= LOW_STOCK_THRESHOLD ? 'low' : 'in'
}

const ACRONYMS = new Set(['suv'])

export function titleCase(value: string): string {
  if (ACRONYMS.has(value)) return value.toUpperCase()
  return value.charAt(0).toUpperCase() + value.slice(1)
}

export function vehicleTitle(vehicle: Pick<Vehicle, 'make' | 'model'>): string {
  return `${vehicle.make} ${vehicle.model}`
}

const miles = new Intl.NumberFormat('en-US')

/** "42,150 mi" */
export function formatMileage(value: number): string {
  return `${miles.format(value)} mi`
}

export const CONDITION_LABELS: Record<VehicleCondition, string> = {
  new: 'New',
  used: 'Used',
  certified: 'Certified pre-owned',
}

/** Short enough for a one-line summary in the list. */
const SHORT_CONDITION: Record<VehicleCondition, string> = { new: 'New', used: 'Used', certified: 'Certified' }

/** Used and certified vehicles lead with their condition and mileage; new ones need neither. */
export function specLine(
  vehicle: Pick<Vehicle, 'category' | 'fuel_type' | 'transmission'> & Partial<Pick<Vehicle, 'condition' | 'mileage'>>,
): string[] {
  const history =
    vehicle.condition && vehicle.condition !== 'new'
      ? [SHORT_CONDITION[vehicle.condition], ...(vehicle.mileage != null ? [formatMileage(vehicle.mileage)] : [])]
      : []
  return [...history, titleCase(vehicle.category), titleCase(vehicle.fuel_type), titleCase(vehicle.transmission)]
}
