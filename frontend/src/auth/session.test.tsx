import { screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw/http'
import { describe, expect, it } from 'vitest'
import { API_URL } from '../api/client'
import { authCalls, expireToken, holdRefreshCookie, PASSWORD, seedUser, seedVehicle, tokenFor } from '../test/handlers'
import { server } from '../test/server'
import { renderApp } from '../test/utils'
import { TOKEN_STORAGE_KEY } from './tokenStorage'

describe('sessions', () => {
  it('replaces an expired access token without interrupting the user', async () => {
    const customer = seedUser('customer')
    seedVehicle({ make: 'Kia', model: 'Seltos' })
    holdRefreshCookie(customer)
    expireToken(tokenFor(customer))

    renderApp({ path: '/app/inventory', user: customer })

    const list = await screen.findByRole('list', { name: /vehicles/i })
    expect(within(list).getByText('Kia Seltos')).toBeInTheDocument()
    expect(localStorage.getItem(TOKEN_STORAGE_KEY)).toMatch(/refreshed/)
  })

  it('refreshes once when several requests fail together', async () => {
    const dealer = seedUser('dealer')
    holdRefreshCookie(dealer)
    expireToken(tokenFor(dealer))

    // The dashboard page fires several requests at once.
    renderApp({ path: '/app/inventory', user: dealer })

    expect(await screen.findByRole('heading', { name: /inventory/i, level: 1 })).toBeInTheDocument()
    await waitFor(() => expect(authCalls.refresh).toBe(1))
  })

  it('sends the user to sign in when the session has ended', async () => {
    const customer = seedUser('customer')
    expireToken(tokenFor(customer)) // and no refresh cookie

    renderApp({ path: '/app/inventory', user: customer })

    expect(await screen.findByRole('button', { name: /^sign in$/i })).toBeInTheDocument()
    expect(localStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull()
  })

  it('signs out on the server as well', async () => {
    const customer = seedUser('customer')
    const { user } = renderApp({ path: '/app/inventory', user: customer })

    await user.click(await screen.findByRole('button', { name: 'Sign out' }))

    await waitFor(() => expect(authCalls.logout).toBe(1))
    expect(localStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull()
  })

  it('signs out of all devices from My account, after confirming', async () => {
    const customer = seedUser('customer')
    const { user } = renderApp({ path: '/app/account', user: customer })

    await user.click(await screen.findByRole('button', { name: 'Sign out of all devices' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Sign out of all devices?' })
    await user.click(within(dialog).getByRole('button', { name: 'Sign out everywhere' }))

    expect(await screen.findByRole('button', { name: /^sign in$/i })).toBeInTheDocument()
    expect(authCalls.logoutAll).toBe(1)
    expect(localStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull()
  })

  it('stays signed in if signing out everywhere fails', async () => {
    server.use(
      http.post(`${API_URL}/auth/logout-all`, () =>
        HttpResponse.json({ error: { code: 'HTTP_ERROR', message: 'Server unavailable' } }, { status: 503 }),
      ),
    )
    const { user } = renderApp({ path: '/app/account', user: seedUser('customer') })

    await user.click(await screen.findByRole('button', { name: 'Sign out of all devices' }))
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Sign out everywhere' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Server unavailable')
    expect(screen.getByRole('heading', { name: 'My account' })).toBeInTheDocument()
  })

  it('shows the lockout message after too many failed sign-ins', async () => {
    server.use(
      http.post(`${API_URL}/auth/login`, () =>
        HttpResponse.json(
          { error: { code: 'TOO_MANY_ATTEMPTS', message: 'Too many failed sign-in attempts. Try again in 15 minute(s).' } },
          { status: 429, headers: { 'Retry-After': '900' } },
        ),
      ),
    )
    const customer = seedUser('customer')
    const { user } = renderApp({ path: '/login' })

    await user.type(await screen.findByLabelText('Email'), customer.email)
    await user.type(screen.getByLabelText('Password'), PASSWORD)
    await user.click(screen.getByRole('button', { name: /^sign in$/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Try again in 15 minute(s)')
  })
})
