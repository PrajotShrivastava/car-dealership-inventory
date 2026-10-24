import type { Vehicle } from '../../api/types'

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

export function specLine(vehicle: Pick<Vehicle, 'category' | 'fuel_type' | 'transmission'>): string[] {
  return [titleCase(vehicle.category), titleCase(vehicle.fuel_type), titleCase(vehicle.transmission)]
}
