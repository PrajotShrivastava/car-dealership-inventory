import { screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PASSWORD, seedUser } from './test/handlers'
import { renderApp } from './test/utils'

describe('routing', () => {
  it('serves the public home page at / without signing in', async () => {
    renderApp({ path: '/' })

    expect(await screen.findByRole('navigation', { name: /primary/i })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /^inventory$/i })).not.toBeInTheDocument()
  })

  it('keeps the inventory app behind sign-in at /app', async () => {
    renderApp({ path: '/app' })

    expect(await screen.findByRole('heading', { name: /sign in/i })).toBeInTheDocument()
  })

  it('redirects the old /register path to /signup', async () => {
    const { router } = renderApp({ path: '/register' })

    expect(await screen.findByRole('heading', { name: /create your account/i })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/signup')
  })

  it('sends users to /app after signing in', async () => {
    seedUser('customer', 'jane@example.com')
    const { user, router } = renderApp({ path: '/login' })

    await user.type(await screen.findByLabelText(/email/i), 'jane@example.com')
    await user.type(screen.getByLabelText(/password/i), PASSWORD)
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/app'))
  })

  it('sends users to /app after signing up', async () => {
    const { user, router } = renderApp({ path: '/signup' })

    await user.type(await screen.findByLabelText(/full name/i), 'New Buyer')
    await user.type(screen.getByLabelText(/email/i), 'buyer@example.com')
    await user.type(screen.getByLabelText(/password/i), 'long-enough-1')
    await user.click(screen.getByRole('button', { name: /create account/i }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/app'))
  })

  it('returns to the originally requested app URL, query included, after signing in', async () => {
    seedUser('customer', 'jane@example.com')
    const { user, router } = renderApp({ path: '/app?category=suv' })

    await user.type(await screen.findByLabelText(/email/i), 'jane@example.com')
    await user.type(screen.getByLabelText(/password/i), PASSWORD)
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/app'))
    expect(router.state.location.search).toBe('?category=suv')
  })

  it('sends signed-in users away from sign-in and sign-up to /app', async () => {
    const customer = seedUser('customer')
    const { router } = renderApp({ path: '/signup', user: customer })

    await waitFor(() => expect(router.state.location.pathname).toBe('/app'))
  })

  it('lets signed-in users browse public pages', async () => {
    const customer = seedUser('customer')
    const { router } = renderApp({ path: '/', user: customer })

    expect(await screen.findByRole('link', { name: /open dashboard/i })).toHaveAttribute('href', '/app')
    expect(router.state.location.pathname).toBe('/')
  })

  it('shows a 404 page for unknown URLs', async () => {
    renderApp({ path: '/no-such-page' })

    expect(await screen.findByRole('heading', { name: /page not found/i })).toBeInTheDocument()
  })
})
