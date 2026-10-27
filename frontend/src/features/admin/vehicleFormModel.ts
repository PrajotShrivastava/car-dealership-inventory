import {
  CATEGORIES,
  MAX_FEATURES,
  type Category,
  type FuelType,
  type Transmission,
  type Vehicle,
  type VehicleCondition,
  type VehicleFields,
} from '../../api/types'

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
  condition: VehicleCondition
  mileage: string
  colour: string
  vin: string
  /** One feature per line or comma-separated, e.g. "Sunroof, Heated seats". */
  features: string
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
    condition: vehicle?.condition ?? 'new',
    mileage: vehicle?.mileage != null ? String(vehicle.mileage) : '',
    colour: vehicle?.colour ?? '',
    vin: vehicle?.vin ?? '',
    features: vehicle?.features.join(', ') ?? '',
  }
}

/** Upper-cased, without spaces or dashes, as the API stores it. */
export function normaliseVin(value: string): string {
  return value.replace(/[\s-]/g, '').toUpperCase()
}

/** Split on commas and new lines; blanks and repeats (ignoring case) dropped. */
export function parseFeatures(value: string): string[] {
  const seen = new Set<string>()
  return value
    .split(/[,\n]/)
    .map((feature) => feature.trim())
    .filter((feature) => {
      const key = feature.toLowerCase()
      if (!feature || seen.has(key)) return false
      seen.add(key)
      return true
    })
}

const MONEY = /^\d+(\.\d{1,2})?$/
const WHOLE = /^\d+$/
const VIN = /^[A-HJ-NPR-Z0-9]{17}$/
export const MAX_MILEAGE = 2_000_000

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
  const mileage = values.mileage.trim()
  if (mileage && (!WHOLE.test(mileage) || Number(mileage) > MAX_MILEAGE)) {
    errors.mileage = `Mileage must be a whole number from 0 to ${MAX_MILEAGE.toLocaleString('en-US')}`
  } else if (!mileage && values.condition !== 'new') {
    errors.mileage = 'Mileage is required for used and certified vehicles'
  }
  if (values.colour.trim().length > 30) errors.colour = 'Colour must be 30 characters or fewer'
  const vin = normaliseVin(values.vin)
  if (vin && !VIN.test(vin)) {
    errors.vin = 'VIN must be 17 letters and digits, without I, O or Q'
  } else if (vin && withQuantity && Number(values.quantity) > 1) {
    errors.vin = 'A vehicle with a VIN is a single car, so its stock can be at most 1'
  }
  const features = parseFeatures(values.features)
  if (features.length > MAX_FEATURES) errors.features = `Up to ${MAX_FEATURES} features`
  else if (features.some((feature) => feature.length > 40)) errors.features = 'Each feature must be 40 characters or fewer'
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
    condition: values.condition,
    mileage: values.mileage.trim() ? Number(values.mileage) : null,
    colour: values.colour.trim() || null,
    vin: normaliseVin(values.vin) || null,
    features: parseFeatures(values.features),
  }
}
