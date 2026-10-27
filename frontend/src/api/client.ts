export const API_URL: string = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api'

/** Absolute URL for a media path returned by the API (photos are served by the API host). */
export function mediaUrl(path: string): string {
  return new URL(path, API_URL).href
}

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly fieldErrors: Record<string, string>

  constructor(status: number, code: string, message: string, fieldErrors: Record<string, string> = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.fieldErrors = fieldErrors
  }
}

interface ErrorBody {
  error?: { code?: string; message?: string; details?: { field: string; issue: string }[] }
}

let authToken: string | null = null
let onUnauthorized: (() => void) | null = null

export function setAuthToken(token: string | null) {
  authToken = token
}

export function setUnauthorizedHandler(handler: (() => void) | null) {
  onUnauthorized = handler
}

let refreshSession: (() => Promise<string | null>) | null = null
let refreshing: Promise<string | null> | null = null

/** How to get a new access token when one expires; resolves to null if the session is over. */
export function setRefreshHandler(handler: (() => Promise<string | null>) | null) {
  refreshSession = handler
}

/** One refresh at a time: requests that fail together all wait for the same new token. */
function refreshOnce(): Promise<string | null> {
  refreshing ??= (refreshSession?.() ?? Promise.resolve(null))
    .catch(() => null)
    .finally(() => {
      refreshing = null
    })
  return refreshing
}

type Query = Record<string, string | number | undefined | null>

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  query?: Query
  signal?: AbortSignal
  /** 'blob' for files such as PDF invoices; JSON otherwise. */
  responseType?: 'json' | 'blob'
}

function buildUrl(path: string, query?: Query) {
  const url = new URL(`${API_URL}${path}`)
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value))
  }
  return url
}

async function toApiError(response: Response): Promise<ApiError> {
  const body = (await response.json().catch(() => ({}))) as ErrorBody
  const fieldErrors = Object.fromEntries(
    (body.error?.details ?? []).map((detail) => [detail.field, detail.issue]),
  )
  return new ApiError(
    response.status,
    body.error?.code ?? 'HTTP_ERROR',
    body.error?.message ?? `Request failed (${response.status})`,
    fieldErrors,
  )
}

const WITHOUT_ACCESS_TOKEN = new Set(['/auth/login', '/auth/register', '/auth/register-dealer', '/auth/refresh', '/auth/logout'])

async function send(path: string, options: RequestOptions, token: string | null): Promise<Response> {
  const { body } = options
  const headers: Record<string, string> = {}
  // FormData sets its own multipart Content-Type (with the boundary).
  if (body !== undefined && !(body instanceof FormData)) headers['Content-Type'] = 'application/json'
  if (token) headers.Authorization = `Bearer ${token}`
  try {
    return await fetch(buildUrl(path, options.query), {
      method: options.method ?? 'GET',
      headers,
      body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
      signal: options.signal,
      // Carries the refresh-token cookie, which the API only accepts on /api/auth.
      credentials: 'include',
    })
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') throw cause
    throw new ApiError(0, 'NETWORK_ERROR', 'Could not reach the server. Check your connection.')
  }
}

export async function apiFetch<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
  let response = await send(path, options, authToken)

  // An expired access token: get a new one once, then retry. Routes that don't use the
  // access token (signing in or up, refreshing, signing out) report their own 401s.
  if (response.status === 401 && authToken && !WITHOUT_ACCESS_TOKEN.has(path)) {
    const token = await refreshOnce()
    if (token) response = await send(path, options, token)
    if (!response.ok && response.status === 401) {
      const error = await toApiError(response)
      onUnauthorized?.()
      throw error
    }
  }

  if (!response.ok) throw await toApiError(response)
  if (response.status === 204) return undefined as T
  if (options.responseType === 'blob') return (await response.blob()) as T
  return (await response.json()) as T
}
