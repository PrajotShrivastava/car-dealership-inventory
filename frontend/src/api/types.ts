export type Role = 'customer' | 'dealer' | 'admin'

export interface User {
  id: number
  email: string
  full_name: string
  role: Role
}

export interface TokenResponse {
  access_token: string
  token_type: 'bearer'
  user: User
}

export const CATEGORIES = [
  'sedan',
  'suv',
  'hatchback',
  'coupe',
  'convertible',
  'truck',
  'van',
  'wagon',
] as const
export type Category = (typeof CATEGORIES)[number]

export const FUEL_TYPES = ['petrol', 'diesel', 'hybrid', 'electric'] as const
export type FuelType = (typeof FUEL_TYPES)[number]

export const TRANSMISSIONS = ['manual', 'automatic'] as const
export type Transmission = (typeof TRANSMISSIONS)[number]

export interface VehicleFields {
  make: string
  model: string
  trim: string | null
  year: number
  category: Category
  fuel_type: FuelType
  transmission: Transmission
  /** Fixed-point decimal string, e.g. "35990.00" */
  price: string
}

/** Paths on the API host, e.g. "/api/media/vehicles/<key>.webp"; resolve with mediaUrl(). */
export interface VehiclePhoto {
  id: number
  url: string
  thumb_url: string
}

export interface Vehicle extends VehicleFields {
  id: number
  quantity: number
  /** In display order; the first is the cover photo. */
  photos: VehiclePhoto[]
}

export type VehicleCreate = VehicleFields & { quantity: number }

export type Availability = 'all' | 'in_stock' | 'out_of_stock'
export type SortOrder =
  | 'newest'
  | 'price_asc'
  | 'price_desc'
  | 'year_desc'
  | 'year_asc'
  | 'make_asc'

export interface VehicleQuery {
  q?: string
  make?: string
  model?: string
  category?: Category
  min_price?: string
  max_price?: string
  availability?: Availability
  sort?: SortOrder
  limit?: number
  offset?: number
}

export interface VehicleList {
  items: Vehicle[]
  total: number
  counts: { all: number; in_stock: number; out_of_stock: number }
}

export interface Purchase {
  id: number
  vehicle_id: number | null
  vehicle_label: string
  quantity: number
  unit_price: string
  total_price: string
  created_at: string
}

export interface PurchaseResult {
  purchase: Purchase
  vehicle: Vehicle
}

export type ApplicationStatus = 'pending' | 'approved' | 'rejected'

export interface DealerApplication {
  id: number
  status: ApplicationStatus
  business_name: string
  phone: string | null
  message: string | null
  created_at: string
  reviewed_at: string | null
  review_note: string | null
  applicant: User
}

/** Same fields as customer sign-up; the account is created as a dealer. */
export interface DealerRegisterRequest {
  full_name: string
  email: string
  password: string
}
