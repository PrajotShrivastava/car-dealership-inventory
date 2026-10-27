import { CATEGORIES, type Category, type FuelType, type Transmission, type Vehicle, type VehicleFields } from '../../api/types'

export interface VehicleFormValues {
  make: string
  model: string
  trim: string
  year: string
  category: Category
  fuel_type: FuelType
  transmission: Transmission
  price: string
  /** Optional: blank means unknown. */
  acquisition_cost: string
  quantity: string
}

export type VehicleFormErrors = Partial<Record<keyof VehicleFormValues, string>>

export const MAX_YEAR = new Date().getFullYear() + 1

export function initialValues(vehicle?: Vehicle): VehicleFormValues {
  return {
    make: vehicle?.make ?? '',
    model: vehicle?.model ?? '',
    trim: vehicle?.trim ?? '',
    year: String(vehicle?.year ?? new Date().getFullYear()),
    category: vehicle?.category ?? CATEGORIES[0],
    fuel_type: vehicle?.fuel_type ?? 'petrol',
    transmission: vehicle?.transmission ?? 'automatic',
    price: vehicle ? String(Number(vehicle.price)) : '',
    acquisition_cost: vehicle?.acquisition_cost ? String(Number(vehicle.acquisition_cost)) : '',
    quantity: '1',
  }
}

const MONEY = /^\d+(\.\d{1,2})?$/
const WHOLE = /^\d+$/

export function validate(values: VehicleFormValues, { withQuantity }: { withQuantity: boolean }): VehicleFormErrors {
  const errors: VehicleFormErrors = {}
  if (!values.make.trim()) errors.make = 'Make is required'
  if (!values.model.trim()) errors.model = 'Model is required'
  const year = Number(values.year)
  if (!WHOLE.test(values.year) || year < 1900 || year > MAX_YEAR) {
    errors.year = `Year must be between 1900 and ${MAX_YEAR}`
  }
  if (!MONEY.test(values.price.trim()) || Number(values.price) <= 0) {
    errors.price = 'Price must be greater than 0 (max 2 decimals)'
  }
  const cost = values.acquisition_cost.trim()
  if (cost && !MONEY.test(cost)) {
    errors.acquisition_cost = 'Cost must be 0 or more (max 2 decimals), or left blank'
  }
  if (withQuantity && (!WHOLE.test(values.quantity.trim()) || Number(values.quantity) > 10_000)) {
    errors.quantity = 'Stock must be a whole number of 0 or more (max 10,000)'
  }
  return errors
}

export function toFields(values: VehicleFormValues): VehicleFields {
  return {
    make: values.make.trim(),
    model: values.model.trim(),
    trim: values.trim.trim() || null,
    year: Number(values.year),
    category: values.category,
    fuel_type: values.fuel_type,
    transmission: values.transmission,
    price: Number(values.price).toFixed(2),
    acquisition_cost: values.acquisition_cost.trim() ? Number(values.acquisition_cost).toFixed(2) : null,
  }
}
