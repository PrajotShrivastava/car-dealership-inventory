/**
 * In-memory fake of the DriveStock API for component/integration tests.
 * Mirrors the real contract (status codes, error shape) closely enough to
 * exercise UI flows; the real API has its own pytest suite.
 */
import { http, HttpResponse } from 'msw/http'
import type { DealerApplication, User, Vehicle, VehicleCreate } from '../api/types'

const API = 'http://localhost:8000/api'

interface StoredUser extends User {
  password: string
}

let users: StoredUser[] = []
let vehicles: Vehicle[] = []
let applications: DealerApplication[] = []
let nextId = 1

export const PASSWORD = 'password-123'

export function resetDb() {
  users = []
  vehicles = []
  applications = []
  nextId = 1
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

export function seedUser(role: User['role'] = 'customer', email = `${role}@example.com`): User {
  const user: StoredUser = { id: nextId++, email, full_name: `Test ${role}`, role, password: PASSWORD }
  users.push(user)
  const { password: _password, ...publicUser } = user
  return publicUser
}

export function tokenFor(user: User) {
  return `token-${user.id}`
}

export function seedVehicle(overrides: Partial<Vehicle> = {}): Vehicle {
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
    ...overrides,
  }
  vehicles.push(vehicle)
  return vehicle
}

export function getVehicle(id: number) {
  return vehicles.find((v) => v.id === id)
}

const error = (status: number, code: string, message: string) =>
  HttpResponse.json({ error: { code, message } }, { status })

function currentUser(request: Request): StoredUser | undefined {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  return users.find((u) => tokenFor(u) === token)
}

function publicUser({ password: _password, ...user }: StoredUser): User {
  return user
}

function listVehicles(request: Request) {
  const url = new URL(request.url)
  const p = Object.fromEntries(url.searchParams)
  let items = vehicles.filter((v) => {
    const text = `${v.make} ${v.model} ${v.trim ?? ''}`.toLowerCase()
    return (
      (!p.q || p.q.toLowerCase().split(/\s+/).every((w) => text.includes(w))) &&
      (!p.category || v.category === p.category) &&
      (!p.min_price || Number(v.price) >= Number(p.min_price)) &&
      (!p.max_price || Number(v.price) <= Number(p.max_price))
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
  const offset = Number(p.offset ?? 0)
  const limit = Number(p.limit ?? 20)
  return HttpResponse.json({ items: items.slice(offset, offset + limit), total: items.length, counts })
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
    if (applicant) applicant.role = 'admin'
    application.applicant = { ...application.applicant, role: 'admin' }
  }
  return HttpResponse.json(application)
}

export const handlers = [
  http.post(`${API}/auth/register-dealer`, async ({ request }) => {
    const body = (await request.json()) as {
      email: string
      password: string
      full_name: string
      business_name: string
      phone?: string
      message?: string
    }
    const email = body.email.toLowerCase()
    if (users.some((u) => u.email === email)) {
      return error(409, 'EMAIL_TAKEN', 'An account with this email already exists')
    }
    const user: StoredUser = { id: nextId++, email, full_name: body.full_name, role: 'customer', password: body.password }
    users.push(user)
    const application = seedApplication(publicUser(user), {
      business_name: body.business_name,
      phone: body.phone || null,
      message: body.message || null,
    })
    return HttpResponse.json({ user: publicUser(user), application }, { status: 201 })
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
    const vehicle = getVehicle(Number(params.id))
    return vehicle ? HttpResponse.json(vehicle) : error(404, 'VEHICLE_NOT_FOUND', 'Vehicle not found')
  }),

  http.post(`${API}/vehicles`, async ({ request }) => {
    const user = currentUser(request)
    if (!user) return error(401, 'NOT_AUTHENTICATED', 'Authentication required')
    if (user.role !== 'admin') return error(403, 'FORBIDDEN', 'Admin privileges required')
    const body = (await request.json()) as VehicleCreate
    return HttpResponse.json(seedVehicle({ ...body, price: Number(body.price).toFixed(2) }), { status: 201 })
  }),

  http.put(`${API}/vehicles/:id`, async ({ request, params }) => {
    const user = currentUser(request)
    if (user?.role !== 'admin') return error(403, 'FORBIDDEN', 'Admin privileges required')
    const vehicle = getVehicle(Number(params.id))
    if (!vehicle) return error(404, 'VEHICLE_NOT_FOUND', 'Vehicle not found')
    Object.assign(vehicle, (await request.json()) as Partial<Vehicle>)
    vehicle.price = Number(vehicle.price).toFixed(2)
    return HttpResponse.json(vehicle)
  }),

  http.delete(`${API}/vehicles/:id`, ({ request, params }) => {
    const user = currentUser(request)
    if (user?.role !== 'admin') return error(403, 'FORBIDDEN', 'Admin privileges required')
    const before = vehicles.length
    vehicles = vehicles.filter((v) => v.id !== Number(params.id))
    return before === vehicles.length
      ? error(404, 'VEHICLE_NOT_FOUND', 'Vehicle not found')
      : new HttpResponse(null, { status: 204 })
  }),

  http.post(`${API}/vehicles/:id/purchase`, async ({ request, params }) => {
    if (!currentUser(request)) return error(401, 'NOT_AUTHENTICATED', 'Authentication required')
    const vehicle = getVehicle(Number(params.id))
    if (!vehicle) return error(404, 'VEHICLE_NOT_FOUND', 'Vehicle not found')
    const text = await request.text()
    const quantity = text ? ((JSON.parse(text) as { quantity?: number }).quantity ?? 1) : 1
    if (vehicle.quantity === 0) return error(409, 'OUT_OF_STOCK', `${vehicle.make} ${vehicle.model} is out of stock`)
    if (vehicle.quantity < quantity) {
      return error(409, 'INSUFFICIENT_STOCK', `Only ${vehicle.quantity} unit(s) available`)
    }
    vehicle.quantity -= quantity
    const unit = Number(vehicle.price)
    return HttpResponse.json({
      purchase: {
        id: nextId++,
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

  http.post(`${API}/vehicles/:id/restock`, async ({ request, params }) => {
    const user = currentUser(request)
    if (user?.role !== 'admin') return error(403, 'FORBIDDEN', 'Admin privileges required')
    const vehicle = getVehicle(Number(params.id))
    if (!vehicle) return error(404, 'VEHICLE_NOT_FOUND', 'Vehicle not found')
    vehicle.quantity += ((await request.json()) as { quantity: number }).quantity
    return HttpResponse.json(vehicle)
  }),
]
