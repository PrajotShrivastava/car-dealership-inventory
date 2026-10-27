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

/** "certified": used, inspected and warrantied by the dealer or manufacturer. */
export const CONDITIONS = ['new', 'used', 'certified'] as const
export type VehicleCondition = (typeof CONDITIONS)[number]

export const MAX_FEATURES = 30

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
  /** Per unit, for gross profit. Only the vehicle's dealer and admins receive it (else null). */
  acquisition_cost?: string | null
  condition: VehicleCondition
  /** Miles on the odometer; required for used and certified vehicles. */
  mileage: number | null
  colour: string | null
  /** 17 characters. A vehicle with a VIN is one car, so its stock is at most 1. */
  vin: string | null
  /** Short labels such as "Sunroof", in the dealer's order. */
  features: string[]
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
  /** False when no dealer listed it, so there is nobody to send questions or test-drive requests to. */
  accepts_enquiries: boolean
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
  | 'mileage_asc'

export interface VehicleQuery {
  q?: string
  make?: string
  model?: string
  category?: Category
  min_price?: string
  max_price?: string
  availability?: Availability
  condition?: VehicleCondition
  max_mileage?: number
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

/** Months of history the dashboard's sales chart can show. */
export const DASHBOARD_RANGES = [3, 6, 12] as const
export type DashboardRange = (typeof DASHBOARD_RANGES)[number]

/** Money fields are fixed-point strings, like vehicle prices. */
export interface DashboardSummary {
  total_listings: number
  available_stock: number
  in_stock: number
  low_stock: number
  out_of_stock: number
  never_sold: number
  low_stock_threshold: number
  inventory_value: string
  units_sold: number
  /** Completed sale transactions; one sale can be several units. */
  sales_count: number
  total_revenue: string
  /** Over sales whose acquisition cost is known; null when none are. */
  gross_profit: string | null
  sales_with_cost: number
  units_sold_this_month: number
  revenue_this_month: string
  units_sold_last_month: number
  revenue_last_month: string
  /** False until there is a sale before this month: no comparison is shown. */
  has_sales_before_this_month: boolean
}

export interface MonthlySales {
  /** "2026-10" */
  month: string
  units: number
  revenue: string
}

export interface DashboardVehicle {
  id: number
  make: string
  model: string
  trim: string | null
  year: number
  category: Category
  price: string
  quantity: number
  units_sold: number
  revenue: string
  photo: VehiclePhoto | null
  created_at: string
}

export interface TopVehicle {
  label: string
  units_sold: number
  revenue: string
  /** Null once the vehicle has been deleted; its sales still count. */
  vehicle: DashboardVehicle | null
}

export interface RecentSale {
  id: number
  channel: SaleChannel
  /** The sale date. */
  created_at: string
  customer_name: string | null
  vehicle_id: number | null
  vehicle_label: string
  quantity: number
  unit_price: string
  total_price: string
}

export interface Dashboard {
  timezone: string
  summary: DashboardSummary
  monthly: MonthlySales[]
  best_seller: TopVehicle | null
  top_revenue: TopVehicle | null
  top_sellers: TopVehicle[]
  low_stock: DashboardVehicle[]
  out_of_stock: DashboardVehicle[]
  never_sold: DashboardVehicle[]
  recent_listings: DashboardVehicle[]
  recent_sales: RecentSale[]
  follow_ups: FollowUps
}

export type SaleChannel = 'online' | 'dealer'

export interface Customer {
  name: string | null
  email: string | null
  phone: string | null
}

/** A completed sale, as the selling dealer sees it. */
export interface Sale {
  id: number
  channel: SaleChannel
  sold_at: string
  vehicle_id: number | null
  vehicle_label: string
  quantity: number
  unit_price: string
  total_price: string
  /** Null when the vehicle had no acquisition cost; profit is then unknown, not zero. */
  unit_cost: string | null
  gross_profit: string | null
  customer: Customer
  lead_id: number | null
}

export interface SaleCreate {
  vehicle_id: number
  quantity: number
  unit_price: string
  /** "YYYY-MM-DD" in the dealer's time zone (`tz`); not in the future. */
  sold_on: string
  tz: string
  customer_name: string
  customer_email: string | null
  customer_phone: string | null
  lead_id: number | null
  /** A fresh UUID per form: resubmitting it records the sale only once. */
  request_id: string
}

export interface SaleQuery {
  q?: string
  vehicle_id?: number
  channel?: SaleChannel
  date_from?: string
  date_to?: string
  tz?: string
  limit?: number
  offset?: number
}

export interface SaleList {
  items: Sale[]
  total: number
  totals: { sales: number; units: number; revenue: string; gross_profit: string | null; sales_with_cost: number }
}

export const LEAD_STATUSES = ['new', 'contacted', 'test_drive_scheduled', 'negotiation', 'converted', 'lost'] as const
export type LeadStatus = (typeof LEAD_STATUSES)[number]

export interface LeadEvent {
  kind: 'created' | 'status' | 'follow_up' | 'sale'
  old_value: string | null
  new_value: string | null
  created_at: string
}

export type EnquiryKind = 'question' | 'test_drive'

/** A signed-in customer's question or test-drive request; their name and email come from the account. */
export interface EnquiryCreate {
  kind: EnquiryKind
  message?: string
  phone?: string
  /** "YYYY-MM-DD"; test drives only. */
  preferred_date?: string
  tz?: string
}

export interface Enquiry {
  id: number
  kind: EnquiryKind
  vehicle_id: number
  created_at: string
}

export interface LeadFields {
  name: string
  email: string | null
  phone: string | null
  vehicle_id: number | null
  budget: string | null
  source: string | null
  notes: string | null
  /** "YYYY-MM-DD", compared with the dealer's local date. */
  follow_up_on: string | null
  status: LeadStatus
}

export interface Lead extends LeadFields {
  id: number
  vehicle_label: string | null
  created_at: string
  updated_at: string
  /** The sale recorded from this lead, if any. */
  sale_id: number | null
  events: LeadEvent[]
}

export type FollowUpFilter = 'overdue' | 'today' | 'upcoming' | 'none'

export interface LeadQuery {
  q?: string
  status?: LeadStatus
  follow_up?: FollowUpFilter
  tz?: string
  limit?: number
  offset?: number
}

export interface Reminders {
  overdue: number
  today: number
  upcoming: number
}

export interface LeadList {
  items: Lead[]
  total: number
  counts: Record<LeadStatus, number>
  reminders: Reminders
}

export interface FollowUps extends Reminders {
  items: { id: number; name: string; status: LeadStatus; follow_up_on: string; vehicle_label: string | null }[]
}
