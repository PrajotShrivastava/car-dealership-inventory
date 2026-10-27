import { screen, waitFor, within } from '@testing-library/react'
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

  it('sends customers to their inventory after signing in', async () => {
    seedUser('customer', 'jane@example.com')
    const { user, router } = renderApp({ path: '/login' })

    await user.type(await screen.findByLabelText(/email/i), 'jane@example.com')
    await user.type(screen.getByLabelText(/password/i), PASSWORD)
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/app/inventory'))
  })

  it('sends new customers to the inventory after signing up', async () => {
    const { user, router } = renderApp({ path: '/signup' })

    await user.type(await screen.findByLabelText(/full name/i), 'New Buyer')
    await user.type(screen.getByLabelText(/email/i), 'buyer@example.com')
    await user.type(screen.getByLabelText(/password/i), 'long-enough-1')
    await user.click(screen.getByRole('button', { name: /create account/i }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/app/inventory'))
  })

  it('returns to the originally requested app URL, query included, after signing in', async () => {
    seedUser('customer', 'jane@example.com')
    const { user, router } = renderApp({ path: '/app?category=suv' })

    await user.type(await screen.findByLabelText(/email/i), 'jane@example.com')
    await user.type(screen.getByLabelText(/password/i), PASSWORD)
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/app/inventory'))
    expect(router.state.location.search).toBe('?category=suv')
  })

  it('sends signed-in users away from sign-in and sign-up into the app', async () => {
    const customer = seedUser('customer')
    const { router } = renderApp({ path: '/signup', user: customer })

    await waitFor(() => expect(router.state.location.pathname).toBe('/app/inventory'))
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

describe('app home by role', () => {
  const sidebar = () => screen.getAllByRole('navigation', { name: 'Main' })[0]!

  it('opens the dashboard for a dealer who signs in', async () => {
    seedUser('dealer', 'dana@motors.example')
    const { user, router } = renderApp({ path: '/login' })

    await user.click(await screen.findByRole('tab', { name: 'Dealer Sign In' }))
    await user.type(screen.getByLabelText(/email/i), 'dana@motors.example')
    await user.type(screen.getByLabelText(/password/i), PASSWORD)
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/app/dashboard'))
    expect(await screen.findByRole('heading', { name: 'Dashboard', level: 1 })).toBeInTheDocument()
  })

  it('opens the dashboard when a dealer reloads or opens /app directly', async () => {
    const { router } = renderApp({ path: '/app', user: seedUser('dealer') })

    await waitFor(() => expect(router.state.location.pathname).toBe('/app/dashboard'))
  })

  it('lists Dashboard, Vehicles, Sales and Leads separately in the dealer sidebar', async () => {
    const { user, router } = renderApp({ path: '/app', user: seedUser('dealer') })

    await screen.findByRole('heading', { name: 'Dashboard', level: 1 })
    const links = within(sidebar()).getAllByRole('link')
    expect(links.map((link) => link.textContent)).toEqual(['Dashboard', 'Vehicles', 'Sales', 'Leads'])
    expect(links[0]).toHaveAttribute('aria-current', 'page')

    await user.click(within(sidebar()).getByRole('link', { name: 'Vehicles' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/app/inventory'))
    expect(await screen.findByRole('heading', { name: 'Inventory', level: 1 })).toBeInTheDocument()

    await user.click(within(sidebar()).getByRole('link', { name: 'Dashboard' }))
    expect(await screen.findByRole('heading', { name: 'Dashboard', level: 1 })).toBeInTheDocument()
  })

  it.each(['customer', 'admin'] as const)('sends a %s from /app to the inventory, with no dashboard', async (role) => {
    const { router } = renderApp({ path: '/app?category=suv', user: seedUser(role) })

    await waitFor(() => expect(router.state.location.pathname).toBe('/app/inventory'))
    expect(router.state.location.search).toBe('?category=suv')
    await screen.findByRole('heading', { name: 'Inventory', level: 1 })
    expect(within(sidebar()).queryByRole('link', { name: 'Dashboard' })).not.toBeInTheDocument()
    expect(within(sidebar()).queryByRole('link', { name: 'Sales' })).not.toBeInTheDocument()
    expect(within(sidebar()).queryByRole('link', { name: 'Leads' })).not.toBeInTheDocument()
  })

  it.each(['customer', 'admin'] as const)('keeps a %s out of the dealer dashboard', async (role) => {
    const { router } = renderApp({ path: '/app/dashboard', user: seedUser(role) })

    await waitFor(() => expect(router.state.location.pathname).toBe('/app/inventory'))
  })

  it('keeps the admin pages for admins', async () => {
    renderApp({ path: '/app/dealer-applications', user: seedUser('admin') })

    expect(await screen.findByRole('heading', { name: /dealer applications/i, level: 1 })).toBeInTheDocument()
    expect(within(sidebar()).getByRole('link', { name: /dealer applications/i })).toBeInTheDocument()
  })
})
