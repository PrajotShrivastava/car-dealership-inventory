/**
 * In-memory fake of the DriveStock API for component/integration tests.
 * Mirrors the real contract (status codes, error shape) closely enough to
 * exercise UI flows; the real API has its own pytest suite.
 */
import { http, HttpResponse } from 'msw/http'
import type {
  AccountPurchase,
  Dashboard,
  DashboardRange,
  DealerApplication,
  EnquiryCreate,
  Lead,
  LeadEvent,
  LeadFields,
  LeadStatus,
  Sale,
  SaleCreate,
  User,
  Vehicle,
  VehicleCreate,
  VehiclePhoto,
} from '../api/types'

const API = 'http://localhost:8000/api'

interface StoredUser extends User {
  password: string
}

let users: StoredUser[] = []
let vehicles: Vehicle[] = []
let applications: DealerApplication[] = []
/** Vehicle id -> the dealer who listed it (the real API keeps this server-side). */
let owners = new Map<number, number>()
let sales: (Sale & { dealer_id: number; request_id?: string })[] = []
/** `customer_id`/`enquiry_kind`: set on leads a customer sent from a vehicle's page. */
let leads: (Lead & { dealer_id: number; customer_id?: number; enquiry_kind?: EnquiryCreate['kind'] })[] = []
let purchases: (AccountPurchase & { user_id: number })[] = []
let dashboard: Dashboard | ((months: DashboardRange) => Dashboard) | null = null
let nextId = 1

export const PASSWORD = 'password-123'

export function resetDb() {
  users = []
  vehicles = []
  applications = []
  owners = new Map()
  sales = []
  leads = []
  purchases = []
  dashboard = null
  dashboardRequests.length = 0
  nextId = 1
}

/** The dashboard every dealer receives, optionally varying with the requested range. */
export function setDashboard(value: Dashboard | ((months: DashboardRange) => Dashboard)) {
  dashboard = value
}

/** Query strings the dashboard was requested with, e.g. to check the time zone sent. */
export const dashboardRequests: URLSearchParams[] = []

/** "YYYY-MM" for the `count` months ending October 2026, oldest first. */
export function lastMonths(count: number): string[] {
  return Array.from({ length: count }, (_, i) => {
    const index = 2026 * 12 + 9 - (count - 1 - i)
    return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`
  })
}

/** A dealer with no listings or sales, as the real API reports it. */
export function emptyDashboard(months: DashboardRange = 6): Dashboard {
  return {
    timezone: 'UTC',
    summary: {
      total_listings: 0,
      available_stock: 0,
      in_stock: 0,
      low_stock: 0,
      out_of_stock: 0,
      never_sold: 0,
      low_stock_threshold: 2,
      inventory_value: '0.00',
      units_sold: 0,
      sales_count: 0,
      gross_profit: null,
      sales_with_cost: 0,
      total_revenue: '0.00',
      units_sold_this_month: 0,
      revenue_this_month: '0.00',
      units_sold_last_month: 0,
      revenue_last_month: '0.00',
      has_sales_before_this_month: false,
    },
    monthly: lastMonths(months).map((month) => ({ month, units: 0, revenue: '0.00' })),
    best_seller: null,
    top_revenue: null,
    top_sellers: [],
    low_stock: [],
    out_of_stock: [],
    never_sold: [],
    recent_listings: [],
    recent_sales: [],
    follow_ups: { overdue: 0, today: 0, upcoming: 0, items: [] },
  }
}

export function seedApplication(
  applicant: User,
  overrides: Partial<DealerApplication> = {},
): DealerApplication {
  const application: DealerApplication = {
    id: nextId++,
    status: 'pending',
    business_name: 'Dana Motors',
    phone: null,
    message: null,
    created_at: '2026-10-24T09:00:00Z',
    reviewed_at: null,
    review_note: null,
    applicant,
    ...overrides,
  }
  applications.push(application)
  return application
}

export function getApplication(id: number) {
  return applications.find((a) => a.id === id)
}

/** An admin approving the application from another browser session. */
export function approveElsewhere(id: number) {
  const application = getApplication(id)!
  application.status = 'approved'
  application.reviewed_at = new Date().toISOString()
  application.applicant = { ...application.applicant, role: 'dealer' }
  users.find((u) => u.id === application.applicant.id)!.role = 'dealer'
}

export function seedUser(role: User['role'] = 'customer', email = `${role}@example.com`): User {
  const user: StoredUser = { id: nextId++, email, full_name: `Test ${role}`, role, password: PASSWORD }
  users.push(user)
  const { password: _password, ...publicUser } = user
  return publicUser
}

export function tokenFor(user: User) {
  return `token-${user.id}`
}

/** `owner`: the dealer who listed it. Without one it belongs to no dealer (admin-added). */
export function seedVehicle(overrides: Partial<Vehicle> = {}, owner?: User): Vehicle {
  const vehicle: Vehicle = {
    id: nextId++,
    make: 'Ford',
    model: 'Kuga',
    trim: 'ST-Line',
    year: 2024,
    category: 'suv',
    fuel_type: 'hybrid',
    transmission: 'automatic',
    price: '35990.00',
    quantity: 3,
    condition: 'new',
    mileage: null,
    colour: null,
    vin: null,
    features: [],
    photos: [],
    accepts_enquiries: owner?.role === 'dealer',
    ...overrides,
  }
  vehicles.push(vehicle)
  if (owner?.role === 'dealer') owners.set(vehicle.id, owner.id)
  return vehicle
}


/** The local calendar date, "YYYY-MM-DD", offset by `days`. */
export function localDate(days = 0): string {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return date.toLocaleDateString('en-CA')
}

export function seedSale(owner: User, overrides: Partial<Sale> = {}): Sale {
  const sale = {
    id: nextId++,
    channel: 'dealer' as const,
    sold_at: `${localDate()}T12:00:00Z`,
    vehicle_id: null,
    vehicle_label: '2024 Ford Kuga ST-Line',
    quantity: 1,
    unit_price: '30000.00',
    total_price: '30000.00',
    unit_cost: null,
    gross_profit: null,
    customer: { name: 'Priya Shah', email: 'priya@example.com', phone: null },
    lead_id: null,
    ...overrides,
    dealer_id: owner.id,
  }
  sales.push(sale)
  return sale
}

export function getSales() {
  return sales
}

export function seedLead(
  owner: User,
  overrides: Partial<Lead> & { customer_id?: number; enquiry_kind?: EnquiryCreate['kind'] } = {},
): Lead {
  const lead = {
    id: nextId++,
    name: 'Arjun Mehta',
    email: null,
    phone: null,
    vehicle_id: null,
    vehicle_label: null,
    budget: null,
    source: null,
    notes: null,
    follow_up_on: null,
    status: 'new' as LeadStatus,
    created_at: '2026-10-01T09:00:00Z',
    updated_at: '2026-10-01T09:00:00Z',
    sale_id: null,
    events: [{ kind: 'created', old_value: null, new_value: 'new', created_at: '2026-10-01T09:00:00Z' }] as LeadEvent[],
    ...overrides,
    dealer_id: owner.id,
  }
  leads.push(lead)
  return lead
}

export function getLeads() {
  return leads
}

export function getLead(id: number) {
  return leads.find((lead) => lead.id === id)
}

const CLOSED: LeadStatus[] = ['converted', 'lost']

function followUpBucket(lead: Lead, today: string): 'overdue' | 'today' | 'upcoming' | 'none' | null {
  if (CLOSED.includes(lead.status)) return null
  if (!lead.follow_up_on) return 'none'
  if (lead.follow_up_on < today) return 'overdue'
  if (lead.follow_up_on === today) return 'today'
  const week = new Date(`${today}T00:00:00Z`)
  week.setUTCDate(week.getUTCDate() + 7)
  return lead.follow_up_on <= week.toISOString().slice(0, 10) ? 'upcoming' : null
}

function publicLead({ dealer_id: _dealer, ...lead }: Lead & { dealer_id: number }): Lead {
  return lead
}

function publicSale({ dealer_id: _dealer, request_id: _request, ...sale }: Sale & { dealer_id: number; request_id?: string }): Sale {
  return sale
}

const money = (value: number) => value.toFixed(2)

/** Photo records as the real API returns them (served from /api/media). */
export function fakePhoto(): VehiclePhoto {
  const key = (nextId++).toString(16).padStart(32, '0')
  return {
    id: nextId++,
    url: `/api/media/vehicles/${key}.webp`,
    thumb_url: `/api/media/vehicles/${key}-thumb.webp`,
  }
}

export const MAX_PHOTOS = 10
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp']

/**
 * The uploaded files' types and sizes, read from the raw multipart body. (request.formData()
 * can't parse files in jsdom: its File class differs from the one Node's parser expects.)
 */
async function uploadedFiles(request: Request) {
  const boundary = request.headers.get('content-type')?.split('boundary=')[1] ?? ''
  return (await request.text())
    .split(`--${boundary}`)
    .filter((part) => part.includes('name="files"'))
    .map((part) => {
      const [head = '', ...rest] = part.split('\r\n\r\n')
      return {
        type: /content-type: ([^\r\n]+)/i.exec(head)?.[1] ?? '',
        size: rest.join('\r\n\r\n').replace(/\r\n$/, '').length,
      }
    })
}

export function getVehicle(id: number) {
  return vehicles.find((v) => v.id === id)
}

/** Mirrors the API: dealers see only their own listings; others see every vehicle. */
function visibleTo(user: StoredUser | undefined, vehicle: Vehicle | undefined) {
  if (!user || !vehicle) return undefined
  return user.role !== 'dealer' || owners.get(vehicle.id) === user.id ? vehicle : undefined
}

function findVisible(request: Request, id: unknown) {
  return visibleTo(currentUser(request), getVehicle(Number(id)))
}

/** Mirrors the API: only the vehicle's dealer and admins see its acquisition cost. */
function present(vehicle: Vehicle, user: StoredUser | undefined): Vehicle {
  return user?.role === 'customer' ? { ...vehicle, acquisition_cost: null } : vehicle
}

function requireCustomer(request: Request) {
  const user = currentUser(request)
  if (!user) return { failure: error(401, 'NOT_AUTHENTICATED', 'Authentication required') }
  if (user.role !== 'customer') return { failure: error(403, 'FORBIDDEN', 'Customer account required') }
  return { user }
}

/** The `limit`/`offset` slice of `items`, with the total. */
function page<T>(request: Request, items: T[]) {
  const params = new URL(request.url).searchParams
  const offset = Number(params.get('offset') ?? 0)
  const limit = Number(params.get('limit') ?? 20)
  return { items: items.slice(offset, offset + limit), total: items.length }
}

function requireDealer(request: Request) {
  const user = currentUser(request)
  if (!user) return { failure: error(401, 'NOT_AUTHENTICATED', 'Authentication required') }
  if (user.role !== 'dealer') return { failure: error(403, 'FORBIDDEN', 'Dealer privileges required') }
  return { user }
}

const error = (status: number, code: string, message: string) =>
  HttpResponse.json({ error: { code, message } }, { status })

function currentUser(request: Request): StoredUser | undefined {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  return users.find((u) => tokenFor(u) === token)
}

/** Mirrors the API: dealers and admins may change the inventory. */
function canManageInventory(user: StoredUser | undefined) {
  return user?.role === 'dealer' || user?.role === 'admin'
}

function publicUser({ password: _password, ...user }: StoredUser): User {
  return user
}

function listVehicles(request: Request) {
  const url = new URL(request.url)
  const p = Object.fromEntries(url.searchParams)
  const user = currentUser(request)
  let items = vehicles.filter((v) => visibleTo(user, v)).filter((v) => {
    const text = [v.make, v.model, v.trim, v.colour, v.vin, ...v.features].join(' ').toLowerCase()
    return (
      (!p.q || p.q.toLowerCase().split(/\s+/).every((w) => text.includes(w))) &&
      (!p.category || v.category === p.category) &&
      (!p.min_price || Number(v.price) >= Number(p.min_price)) &&
      (!p.max_price || Number(v.price) <= Number(p.max_price)) &&
      (!p.condition || v.condition === p.condition) &&
      (!p.max_mileage || (v.mileage ?? 0) <= Number(p.max_mileage))
    )
  })
  const counts = {
    all: items.length,
    in_stock: items.filter((v) => v.quantity > 0).length,
    out_of_stock: items.filter((v) => v.quantity === 0).length,
  }
  if (p.availability === 'in_stock') items = items.filter((v) => v.quantity > 0)
  if (p.availability === 'out_of_stock') items = items.filter((v) => v.quantity === 0)
  if (!p.sort || p.sort === 'newest') items = [...items].sort((a, b) => b.id - a.id)
  if (p.sort === 'price_asc') items = [...items].sort((a, b) => Number(a.price) - Number(b.price))
  if (p.sort === 'price_desc') items = [...items].sort((a, b) => Number(b.price) - Number(a.price))
  if (p.sort === 'mileage_asc') items = [...items].sort((a, b) => (a.mileage ?? 0) - (b.mileage ?? 0))
  const offset = Number(p.offset ?? 0)
  const limit = Number(p.limit ?? 20)
  return HttpResponse.json({ items: items.slice(offset, offset + limit).map((v) => present(v, user)), total: items.length, counts })
}

function review(request: Request, id: number, status: 'approved' | 'rejected', note: string | null) {
  const user = currentUser(request)
  if (!user) return error(401, 'NOT_AUTHENTICATED', 'Authentication required')
  if (user.role !== 'admin') return error(403, 'FORBIDDEN', 'Admin privileges required')
  const application = getApplication(id)
  if (!application) return error(404, 'APPLICATION_NOT_FOUND', 'Dealer application not found')
  if (application.status !== 'pending') {
    return error(409, 'APPLICATION_NOT_PENDING', 'This application has already been reviewed')
  }
  application.status = status
  application.reviewed_at = new Date().toISOString()
  application.review_note = note
  if (status === 'approved') {
    const applicant = users.find((u) => u.id === application.applicant.id)
    if (applicant) applicant.role = 'dealer'
    application.applicant = { ...application.applicant, role: 'dealer' }
  }
  return HttpResponse.json(application)
}

export const handlers = [
  http.post(`${API}/auth/register-dealer`, async ({ request }) => {
    const body = (await request.json()) as { email: string; password: string; full_name: string }
    const email = body.email.toLowerCase()
    if (users.some((u) => u.email === email)) {
      return error(409, 'EMAIL_TAKEN', 'An account with this email already exists')
    }
    // A dealer straight away; no application is created.
    const user: StoredUser = { id: nextId++, email, full_name: body.full_name, role: 'dealer', password: body.password }
    users.push(user)
    return HttpResponse.json(publicUser(user), { status: 201 })
  }),

  http.get(`${API}/dealer-applications/me`, ({ request }) => {
    const user = currentUser(request)
    if (!user) return error(401, 'NOT_AUTHENTICATED', 'Authentication required')
    const mine = applications.find((a) => a.applicant.id === user.id)
    return mine
      ? HttpResponse.json(mine)
      : error(404, 'APPLICATION_NOT_FOUND', 'You have not applied to become a dealer')
  }),

  http.get(`${API}/dealer-applications`, ({ request }) => {
    const user = currentUser(request)
    if (!user) return error(401, 'NOT_AUTHENTICATED', 'Authentication required')
    if (user.role !== 'admin') return error(403, 'FORBIDDEN', 'Admin privileges required')
    const status = new URL(request.url).searchParams.get('status')
    return HttpResponse.json(applications.filter((a) => !status || a.status === status))
  }),

  http.post(`${API}/dealer-applications/:id/approve`, ({ request, params }) =>
    review(request, Number(params.id), 'approved', null),
  ),

  http.post(`${API}/dealer-applications/:id/reject`, async ({ request, params }) => {
    const text = await request.text()
    const note = text ? ((JSON.parse(text) as { note?: string }).note ?? null) : null
    return review(request, Number(params.id), 'rejected', note)
  }),

  http.post(`${API}/auth/register`, async ({ request }) => {
    const body = (await request.json()) as { email: string; password: string; full_name: string }
    const email = body.email.toLowerCase()
    if (users.some((u) => u.email === email)) {
      return error(409, 'EMAIL_TAKEN', 'An account with this email already exists')
    }
    const user: StoredUser = { id: nextId++, email, full_name: body.full_name, role: 'customer', password: body.password }
    users.push(user)
    return HttpResponse.json(publicUser(user), { status: 201 })
  }),

  http.post(`${API}/auth/login`, async ({ request }) => {
    const body = (await request.json()) as { email: string; password: string }
    const user = users.find((u) => u.email === body.email.toLowerCase() && u.password === body.password)
    if (!user) return error(401, 'INVALID_CREDENTIALS', 'Invalid email or password')
    return HttpResponse.json({ access_token: tokenFor(user), token_type: 'bearer', user: publicUser(user) })
  }),

  http.get(`${API}/auth/me`, ({ request }) => {
    const user = currentUser(request)
    return user ? HttpResponse.json(publicUser(user)) : error(401, 'INVALID_TOKEN', 'Invalid or expired token')
  }),

  http.get(`${API}/vehicles`, ({ request }) =>
    currentUser(request) ? listVehicles(request) : error(401, 'NOT_AUTHENTICATED', 'Authentication required'),
  ),
  http.get(`${API}/vehicles/search`, ({ request }) =>
    currentUser(request) ? listVehicles(request) : error(401, 'NOT_AUTHENTICATED', 'Authentication required'),
  ),

  http.get(`${API}/vehicles/:id`, ({ request, params }) => {
    if (!currentUser(request)) return error(401, 'NOT_AUTHENTICATED', 'Authentication required')
    const vehicle = findVisible(request, params.id)
    return vehicle ? HttpResponse.json(present(vehicle, currentUser(request))) : error(404, 'VEHICLE_NOT_FOUND', 'Vehicle not found')
  }),

  http.post(`${API}/vehicles`, async ({ request }) => {
    const user = currentUser(request)
    if (!user) return error(401, 'NOT_AUTHENTICATED', 'Authentication required')
    if (!canManageInventory(user)) return error(403, 'FORBIDDEN', 'Dealer or admin privileges required')
    const body = (await request.json()) as VehicleCreate
    return HttpResponse.json(seedVehicle({ ...body, price: Number(body.price).toFixed(2) }, user), { status: 201 })
  }),

  http.put(`${API}/vehicles/:id`, async ({ request, params }) => {
    const user = currentUser(request)
    if (!canManageInventory(user)) return error(403, 'FORBIDDEN', 'Dealer or admin privileges required')
    const vehicle = findVisible(request, params.id)
    if (!vehicle) return error(404, 'VEHICLE_NOT_FOUND', 'Vehicle not found')
    Object.assign(vehicle, (await request.json()) as Partial<Vehicle>)
    vehicle.price = Number(vehicle.price).toFixed(2)
    return HttpResponse.json(vehicle)
  }),

  http.delete(`${API}/vehicles/:id`, ({ request, params }) => {
    const user = currentUser(request)
    if (!canManageInventory(user)) return error(403, 'FORBIDDEN', 'Dealer or admin privileges required')
    const vehicle = findVisible(request, params.id)
    if (!vehicle) return error(404, 'VEHICLE_NOT_FOUND', 'Vehicle not found')
    vehicles = vehicles.filter((v) => v !== vehicle)
    return new HttpResponse(null, { status: 204 })
  }),

  http.post(`${API}/vehicles/:id/purchase`, async ({ request, params }) => {
    if (!currentUser(request)) return error(401, 'NOT_AUTHENTICATED', 'Authentication required')
    const vehicle = findVisible(request, params.id)
    if (!vehicle) return error(404, 'VEHICLE_NOT_FOUND', 'Vehicle not found')
    const text = await request.text()
    const quantity = text ? ((JSON.parse(text) as { quantity?: number }).quantity ?? 1) : 1
    if (vehicle.quantity === 0) return error(409, 'OUT_OF_STOCK', `${vehicle.make} ${vehicle.model} is out of stock`)
    if (vehicle.quantity < quantity) {
      return error(409, 'INSUFFICIENT_STOCK', `Only ${vehicle.quantity} unit(s) available`)
    }
    vehicle.quantity -= quantity
    const unit = Number(vehicle.price)
    const sellerId = owners.get(vehicle.id)
    const purchaseId = nextId++
    purchases.push({
      id: purchaseId,
      user_id: currentUser(request)!.id,
      invoice_number: `INV-${String(purchaseId).padStart(6, '0')}`,
      vehicle_id: vehicle.id,
      vehicle_label: `${vehicle.year} ${vehicle.make} ${vehicle.model}`,
      quantity,
      unit_price: unit.toFixed(2),
      total_price: (unit * quantity).toFixed(2),
      sold_at: new Date().toISOString(),
      seller: users.find((u) => u.id === sellerId)?.full_name ?? 'DriveStock',
    })
    return HttpResponse.json({
      purchase: {
        id: purchaseId,
        vehicle_id: vehicle.id,
        vehicle_label: `${vehicle.year} ${vehicle.make} ${vehicle.model}`,
        quantity,
        unit_price: unit.toFixed(2),
        total_price: (unit * quantity).toFixed(2),
        created_at: new Date().toISOString(),
      },
      vehicle,
    })
  }),

  http.post(`${API}/vehicles/:id/enquiries`, async ({ request, params }) => {
    const user = currentUser(request)
    if (!user) return error(401, 'NOT_AUTHENTICATED', 'Authentication required')
    if (user.role !== 'customer') return error(403, 'FORBIDDEN', 'Only customer accounts can send enquiries')
    const vehicle = findVisible(request, params.id)
    if (!vehicle) return error(404, 'VEHICLE_NOT_FOUND', 'Vehicle not found')
    const label = `${vehicle.year} ${vehicle.make} ${vehicle.model}`
    const dealerId = owners.get(vehicle.id)
    if (dealerId === undefined) {
      return error(409, 'NO_DEALER', `${label} isn't listed by a dealer, so it can't take enquiries`)
    }
    const body = (await request.json()) as EnquiryCreate
    const source = body.kind === 'question' ? 'Website enquiry' : 'Test drive request'
    const duplicate = leads.some(
      (lead) =>
        lead.vehicle_id === vehicle.id && lead.customer_id === user.id && lead.enquiry_kind === body.kind && !CLOSED.includes(lead.status),
    )
    if (duplicate) {
      const noun = body.kind === 'question' ? 'a question' : 'a test drive request'
      return error(409, 'ALREADY_ENQUIRED', `You've already sent ${noun} about ${label}; the dealer will be in touch`)
    }
    const notes = [body.preferred_date && `Preferred test drive date: ${body.preferred_date}`, body.message].filter(Boolean)
    const lead = seedLead(users.find((u) => u.id === dealerId)!, {
      name: user.full_name,
      email: user.email,
      phone: body.phone ?? null,
      vehicle_id: vehicle.id,
      vehicle_label: label,
      source,
      notes: notes.join('\n\n') || null,
      follow_up_on: localDate(),
      created_at: new Date().toISOString(),
      customer_id: user.id,
      enquiry_kind: body.kind,
    })
    return HttpResponse.json(
      { id: lead.id, kind: body.kind, vehicle_id: vehicle.id, created_at: lead.created_at },
      { status: 201 },
    )
  }),

  http.get(`${API}/account/purchases`, ({ request }) => {
    const { user, failure } = requireCustomer(request)
    if (failure) return failure
    const mine = purchases.filter((p) => p.user_id === user.id).reverse()
    return HttpResponse.json(page(request, mine.map(({ user_id: _userId, ...purchase }) => purchase)))
  }),

  http.get(`${API}/account/purchases/:id/invoice`, ({ request, params }) => {
    const { user, failure } = requireCustomer(request)
    if (failure) return failure
    const purchase = purchases.find((p) => p.id === Number(params.id) && p.user_id === user.id)
    if (!purchase) return error(404, 'PURCHASE_NOT_FOUND', `Purchase ${params.id} not found`)
    return new HttpResponse(new Blob(['%PDF-1.4 fake'], { type: 'application/pdf' }), {
      headers: { 'Content-Type': 'application/pdf' },
    })
  }),

  http.get(`${API}/account/enquiries`, ({ request }) => {
    const { user, failure } = requireCustomer(request)
    if (failure) return failure
    const progress = {
      new: 'sent',
      contacted: 'in_progress',
      negotiation: 'in_progress',
      test_drive_scheduled: 'test_drive_scheduled',
      converted: 'completed',
      lost: 'closed',
    } as const
    const mine = leads
      .filter((lead) => lead.customer_id === user.id)
      .reverse()
      .map((lead) => ({
        id: lead.id,
        kind: lead.enquiry_kind ?? null,
        vehicle_id: lead.vehicle_id,
        vehicle_label: lead.vehicle_label,
        progress: progress[lead.status],
        sent_at: lead.created_at,
      }))
    return HttpResponse.json(page(request, mine))
  }),

  http.post(`${API}/vehicles/:id/photos`, async ({ request, params }) => {
    const user = currentUser(request)
    if (!user) return error(401, 'NOT_AUTHENTICATED', 'Authentication required')
    if (!canManageInventory(user)) return error(403, 'FORBIDDEN', 'Dealer or admin privileges required')
    const vehicle = findVisible(request, params.id)
    if (!vehicle) return error(404, 'VEHICLE_NOT_FOUND', 'Vehicle not found')
    const files = await uploadedFiles(request)
    if (files.some((file) => !PHOTO_TYPES.includes(file.type))) {
      return error(415, 'UNSUPPORTED_PHOTO_TYPE', 'Photos must be JPEG, PNG or WebP images')
    }
    if (files.some((file) => file.size > 5 * 1024 * 1024)) {
      return error(413, 'PHOTO_TOO_LARGE', 'Each photo must be 5 MB or smaller')
    }
    if (vehicle.photos.length + files.length > MAX_PHOTOS) {
      return error(409, 'PHOTO_LIMIT_EXCEEDED', 'A vehicle can have at most 10 photos')
    }
    vehicle.photos = [...vehicle.photos, ...files.map(() => fakePhoto())]
    return HttpResponse.json(vehicle, { status: 201 })
  }),

  http.delete(`${API}/vehicles/:id/photos/:photoId`, ({ request, params }) => {
    const user = currentUser(request)
    if (!canManageInventory(user)) return error(403, 'FORBIDDEN', 'Dealer or admin privileges required')
    const vehicle = findVisible(request, params.id)
    const photo = vehicle?.photos.find((p) => p.id === Number(params.photoId))
    if (!vehicle || !photo) return error(404, 'PHOTO_NOT_FOUND', 'Photo not found')
    vehicle.photos = vehicle.photos.filter((p) => p !== photo)
    return new HttpResponse(null, { status: 204 })
  }),

  http.post(`${API}/vehicles/:id/restock`, async ({ request, params }) => {
    const user = currentUser(request)
    if (!canManageInventory(user)) return error(403, 'FORBIDDEN', 'Dealer or admin privileges required')
    const vehicle = findVisible(request, params.id)
    if (!vehicle) return error(404, 'VEHICLE_NOT_FOUND', 'Vehicle not found')
    vehicle.quantity += ((await request.json()) as { quantity: number }).quantity
    return HttpResponse.json(vehicle)
  }),

  http.get(`${API}/dashboard`, ({ request }) => {
    const user = currentUser(request)
    if (!user) return error(401, 'NOT_AUTHENTICATED', 'Authentication required')
    if (user.role !== 'dealer') return error(403, 'FORBIDDEN', 'Dealer privileges required')
    const params = new URL(request.url).searchParams
    dashboardRequests.push(params)
    const months = Number(params.get('months') ?? 6) as DashboardRange
    if (![3, 6, 12].includes(months)) return error(422, 'VALIDATION_ERROR', 'months must be 3, 6 or 12')
    const value = typeof dashboard === 'function' ? dashboard(months) : (dashboard ?? emptyDashboard(months))
    return HttpResponse.json(value)
  }),

  http.get(`${API}/sales`, ({ request }) => {
    const { user, failure } = requireDealer(request)
    if (failure) return failure
    const p = Object.fromEntries(new URL(request.url).searchParams)
    let items = sales.filter((sale) => sale.dealer_id === user.id)
    if (p.vehicle_id) items = items.filter((sale) => sale.vehicle_id === Number(p.vehicle_id))
    if (p.channel) items = items.filter((sale) => sale.channel === p.channel)
    if (p.date_from) items = items.filter((sale) => sale.sold_at.slice(0, 10) >= p.date_from!)
    if (p.date_to) items = items.filter((sale) => sale.sold_at.slice(0, 10) <= p.date_to!)
    for (const word of (p.q ?? '').toLowerCase().split(/\s+/).filter(Boolean)) {
      items = items.filter((sale) =>
        `${sale.vehicle_label} ${sale.customer.name ?? ''} ${sale.customer.email ?? ''} #${sale.id}`.toLowerCase().includes(word),
      )
    }
    items = [...items].sort((a, b) => b.sold_at.localeCompare(a.sold_at) || b.id - a.id)
    const costed = items.filter((sale) => sale.gross_profit !== null)
    const offset = Number(p.offset ?? 0)
    const limit = Number(p.limit ?? 20)
    return HttpResponse.json({
      items: items.slice(offset, offset + limit).map(publicSale),
      total: items.length,
      totals: {
        sales: items.length,
        units: items.reduce((sum, sale) => sum + sale.quantity, 0),
        revenue: money(items.reduce((sum, sale) => sum + Number(sale.total_price), 0)),
        gross_profit: costed.length ? money(costed.reduce((sum, sale) => sum + Number(sale.gross_profit), 0)) : null,
        sales_with_cost: costed.length,
      },
    })
  }),

  http.post(`${API}/sales`, async ({ request }) => {
    const { user, failure } = requireDealer(request)
    if (failure) return failure
    const body = (await request.json()) as SaleCreate
    const replay = sales.find((sale) => sale.dealer_id === user.id && sale.request_id === body.request_id)
    if (replay) return HttpResponse.json(publicSale(replay), { status: 200 })
    if (body.sold_on > localDate()) {
      return HttpResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Request validation failed', details: [{ field: 'sold_on', issue: "sale date can't be in the future" }] } },
        { status: 422 },
      )
    }
    const lead = body.lead_id ? leads.find((l) => l.id === body.lead_id && l.dealer_id === user.id) : undefined
    if (body.lead_id && !lead) return error(404, 'LEAD_NOT_FOUND', 'Lead not found')
    if (lead?.sale_id) return error(409, 'LEAD_ALREADY_CONVERTED', 'This lead has already been converted into a sale')
    const vehicle = visibleTo(user, getVehicle(body.vehicle_id))
    if (!vehicle) return error(404, 'VEHICLE_NOT_FOUND', 'Vehicle not found')
    if (vehicle.quantity === 0) return error(409, 'OUT_OF_STOCK', `${vehicle.make} ${vehicle.model} is out of stock`)
    if (vehicle.quantity < body.quantity) return error(409, 'INSUFFICIENT_STOCK', `Only ${vehicle.quantity} unit(s) available`)
    vehicle.quantity -= body.quantity
    const unit = Number(body.unit_price)
    const cost = vehicle.acquisition_cost == null ? null : Number(vehicle.acquisition_cost)
    const sale = {
      ...seedSale(user, {
        vehicle_id: vehicle.id,
        vehicle_label: [vehicle.year, vehicle.make, vehicle.model, vehicle.trim].filter(Boolean).join(' '),
        sold_at: `${body.sold_on}T12:00:00Z`,
        quantity: body.quantity,
        unit_price: money(unit),
        total_price: money(unit * body.quantity),
        unit_cost: cost === null ? null : money(cost),
        gross_profit: cost === null ? null : money((unit - cost) * body.quantity),
        customer: { name: body.customer_name, email: body.customer_email, phone: body.customer_phone },
        lead_id: body.lead_id,
      }),
    }
    const stored = sales.find((s) => s.id === sale.id)!
    stored.request_id = body.request_id
    if (lead) {
      if (lead.status !== 'converted') {
        lead.events.push({ kind: 'status', old_value: lead.status, new_value: 'converted', created_at: new Date().toISOString() })
        lead.status = 'converted'
      }
      lead.events.push({ kind: 'sale', old_value: null, new_value: String(sale.id), created_at: new Date().toISOString() })
      lead.sale_id = sale.id
    }
    return HttpResponse.json(publicSale(stored), { status: 201 })
  }),

  http.get(`${API}/sales/:id`, ({ request, params }) => {
    const { user, failure } = requireDealer(request)
    if (failure) return failure
    const sale = sales.find((s) => s.id === Number(params.id) && s.dealer_id === user.id)
    return sale ? HttpResponse.json(publicSale(sale)) : error(404, 'SALE_NOT_FOUND', 'Sale not found')
  }),

  http.get(`${API}/sales/:id/invoice`, ({ request, params }) => {
    const { user, failure } = requireDealer(request)
    if (failure) return failure
    const sale = sales.find((s) => s.id === Number(params.id) && s.dealer_id === user.id)
    if (!sale) return error(404, 'SALE_NOT_FOUND', 'Sale not found')
    return new HttpResponse('%PDF-1.4 fake', { headers: { 'Content-Type': 'application/pdf' } })
  }),

  http.get(`${API}/leads`, ({ request }) => {
    const { user, failure } = requireDealer(request)
    if (failure) return failure
    const p = Object.fromEntries(new URL(request.url).searchParams)
    const today = localDate()
    const mine = leads.filter((lead) => lead.dealer_id === user.id)
    let items = mine
    if (p.status) items = items.filter((lead) => lead.status === p.status)
    if (p.follow_up) items = items.filter((lead) => followUpBucket(lead, today) === p.follow_up)
    for (const word of (p.q ?? '').toLowerCase().split(/\s+/).filter(Boolean)) {
      items = items.filter((lead) =>
        `${lead.name} ${lead.email ?? ''} ${lead.phone ?? ''} ${lead.vehicle_label ?? ''}`.toLowerCase().includes(word),
      )
    }
    items = [...items].sort(
      (a, b) =>
        Number(!a.follow_up_on) - Number(!b.follow_up_on) ||
        (a.follow_up_on ?? '').localeCompare(b.follow_up_on ?? '') ||
        b.id - a.id,
    )
    const count = (bucket: string) => mine.filter((lead) => followUpBucket(lead, today) === bucket).length
    const offset = Number(p.offset ?? 0)
    const limit = Number(p.limit ?? 20)
    return HttpResponse.json({
      items: items.slice(offset, offset + limit).map(publicLead),
      total: items.length,
      counts: Object.fromEntries(
        ['new', 'contacted', 'test_drive_scheduled', 'negotiation', 'converted', 'lost'].map((status) => [
          status,
          mine.filter((lead) => lead.status === status).length,
        ]),
      ),
      reminders: { overdue: count('overdue'), today: count('today'), upcoming: count('upcoming') },
    })
  }),

  http.post(`${API}/leads`, async ({ request }) => {
    const { user, failure } = requireDealer(request)
    if (failure) return failure
    const body = (await request.json()) as Partial<LeadFields> & { name: string }
    if (!body.name?.trim()) {
      return HttpResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Request validation failed', details: [{ field: 'name', issue: 'Name is required' }] } },
        { status: 422 },
      )
    }
    const vehicle = body.vehicle_id ? visibleTo(user, getVehicle(body.vehicle_id)) : undefined
    if (body.vehicle_id && !vehicle) return error(404, 'VEHICLE_NOT_FOUND', 'Vehicle not found')
    const status = body.status ?? 'new'
    const lead = seedLead(user, {
      ...body,
      status,
      vehicle_label: vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : null,
      events: [{ kind: 'created', old_value: null, new_value: status, created_at: new Date().toISOString() }],
    })
    return HttpResponse.json(lead, { status: 201 })
  }),

  http.get(`${API}/leads/:id`, ({ request, params }) => {
    const { user, failure } = requireDealer(request)
    if (failure) return failure
    const lead = leads.find((l) => l.id === Number(params.id) && l.dealer_id === user.id)
    return lead ? HttpResponse.json(publicLead(lead)) : error(404, 'LEAD_NOT_FOUND', 'Lead not found')
  }),

  http.patch(`${API}/leads/:id`, async ({ request, params }) => {
    const { user, failure } = requireDealer(request)
    if (failure) return failure
    const lead = leads.find((l) => l.id === Number(params.id) && l.dealer_id === user.id)
    if (!lead) return error(404, 'LEAD_NOT_FOUND', 'Lead not found')
    const body = (await request.json()) as Partial<LeadFields>
    const now = new Date().toISOString()
    if (body.status && body.status !== lead.status) {
      if (lead.sale_id) return error(409, 'LEAD_HAS_SALE', 'A lead with a recorded sale stays converted')
      lead.events.push({ kind: 'status', old_value: lead.status, new_value: body.status, created_at: now })
    }
    if ('follow_up_on' in body && body.follow_up_on !== lead.follow_up_on) {
      lead.events.push({ kind: 'follow_up', old_value: lead.follow_up_on, new_value: body.follow_up_on ?? null, created_at: now })
    }
    Object.assign(lead, body, { updated_at: now })
    return HttpResponse.json(publicLead(lead))
  }),
]
