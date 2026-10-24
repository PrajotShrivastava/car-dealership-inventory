import { http, HttpResponse } from 'msw/http'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { server } from '../test/server'
import { API_URL, ApiError, apiFetch, setAuthToken, setUnauthorizedHandler } from './client'

describe('apiFetch', () => {
  afterEach(() => {
    setAuthToken(null)
    setUnauthorizedHandler(null)
  })

  it('sends JSON and the bearer token when one is set', async () => {
    let seen: { auth: string | null; body: unknown } | undefined
    server.use(
      http.post(`${API_URL}/echo`, async ({ request }) => {
        seen = { auth: request.headers.get('Authorization'), body: await request.json() }
        return HttpResponse.json({ ok: true })
      }),
    )
    setAuthToken('abc123')

    const result = await apiFetch<{ ok: boolean }>('/echo', { method: 'POST', body: { a: 1 } })

    expect(result).toEqual({ ok: true })
    expect(seen).toEqual({ auth: 'Bearer abc123', body: { a: 1 } })
  })

  it('turns structured API errors into ApiError', async () => {
    server.use(
      http.get(`${API_URL}/boom`, () =>
        HttpResponse.json(
          {
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Request validation failed',
              details: [{ field: 'price', issue: 'must be positive' }],
            },
          },
          { status: 422 },
        ),
      ),
    )

    const error = await apiFetch('/boom').catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({
      status: 422,
      code: 'VALIDATION_ERROR',
      fieldErrors: { price: 'must be positive' },
    })
  })

  it('returns undefined for 204 responses', async () => {
    server.use(http.delete(`${API_URL}/thing`, () => new HttpResponse(null, { status: 204 })))

    await expect(apiFetch('/thing', { method: 'DELETE' })).resolves.toBeUndefined()
  })

  it('notifies the unauthorized handler on 401 for authenticated requests', async () => {
    const onUnauthorized = vi.fn()
    setUnauthorizedHandler(onUnauthorized)
    setAuthToken('expired')
    server.use(
      http.get(`${API_URL}/secret`, () =>
        HttpResponse.json(
          { error: { code: 'INVALID_TOKEN', message: 'Invalid or expired token' } },
          { status: 401 },
        ),
      ),
    )

    await expect(apiFetch('/secret')).rejects.toBeInstanceOf(ApiError)
    expect(onUnauthorized).toHaveBeenCalledOnce()
  })

  it('reports network failures as ApiError with status 0', async () => {
    server.use(http.get(`${API_URL}/down`, () => HttpResponse.error()))

    await expect(apiFetch('/down')).rejects.toMatchObject({ status: 0, code: 'NETWORK_ERROR' })
  })
})
