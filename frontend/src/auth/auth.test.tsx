import { screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PASSWORD, seedUser } from '../test/handlers'
import { renderApp } from '../test/utils'
import { TOKEN_STORAGE_KEY } from './tokenStorage'

describe('authentication flow', () => {
  it('redirects anonymous visitors to the sign-in page', async () => {
    renderApp({ path: '/' })

    expect(await screen.findByRole('heading', { name: /sign in/i })).toBeInTheDocument()
  })

  it('signs in with valid credentials and lands on the inventory', async () => {
    seedUser('customer', 'jane@example.com')
    const { user } = renderApp({ path: '/login' })

    await user.type(await screen.findByLabelText(/email/i), 'jane@example.com')
    await user.type(screen.getByLabelText(/password/i), PASSWORD)
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    expect(await screen.findByRole('heading', { name: /inventory/i })).toBeInTheDocument()
    expect(localStorage.getItem(TOKEN_STORAGE_KEY)).toBeTruthy()
  })

  it('shows a generic error for wrong credentials', async () => {
    seedUser('customer', 'jane@example.com')
    const { user } = renderApp({ path: '/login' })

    await user.type(await screen.findByLabelText(/email/i), 'jane@example.com')
    await user.type(screen.getByLabelText(/password/i), 'wrong-password')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/invalid email or password/i)
  })

  it('validates required fields before calling the API', async () => {
    const { user } = renderApp({ path: '/login' })

    await user.click(await screen.findByRole('button', { name: /sign in/i }))

    expect(screen.getByText(/email is required/i)).toBeInTheDocument()
    expect(screen.getByText(/password is required/i)).toBeInTheDocument()
  })

  it('registers a new customer and signs them in', async () => {
    const { user } = renderApp({ path: '/register' })

    await user.type(await screen.findByLabelText(/full name/i), 'New Buyer')
    await user.type(screen.getByLabelText(/email/i), 'buyer@example.com')
    await user.type(screen.getByLabelText(/password/i), 'long-enough-1')
    await user.click(screen.getByRole('button', { name: /create account/i }))

    expect(await screen.findByRole('heading', { name: /inventory/i })).toBeInTheDocument()
    expect(screen.getByText('New Buyer')).toBeInTheDocument()
  })

  it('validates registration input', async () => {
    const { user } = renderApp({ path: '/register' })

    await user.type(await screen.findByLabelText(/email/i), 'not-an-email')
    await user.type(screen.getByLabelText(/password/i), 'short')
    await user.click(screen.getByRole('button', { name: /create account/i }))

    expect(screen.getByText(/full name is required/i)).toBeInTheDocument()
    expect(screen.getByText(/enter a valid email/i)).toBeInTheDocument()
    expect(screen.getByText(/at least 8 characters/i)).toBeInTheDocument()
  })

  it('reports an email that is already registered', async () => {
    seedUser('customer', 'taken@example.com')
    const { user } = renderApp({ path: '/register' })

    await user.type(await screen.findByLabelText(/full name/i), 'Someone')
    await user.type(screen.getByLabelText(/email/i), 'taken@example.com')
    await user.type(screen.getByLabelText(/password/i), 'long-enough-1')
    await user.click(screen.getByRole('button', { name: /create account/i }))

    expect(await screen.findByText(/already exists/i)).toBeInTheDocument()
  })

  it('restores a stored session and shows the user and role', async () => {
    const admin = seedUser('admin')
    renderApp({ path: '/', user: admin })

    expect(await screen.findByRole('heading', { name: /inventory/i })).toBeInTheDocument()
    expect(screen.getByText(admin.full_name)).toBeInTheDocument()
    expect(screen.getByText(/^admin$/i)).toBeInTheDocument()
  })

  it('drops an invalid stored token and asks to sign in', async () => {
    renderApp({ path: '/', token: 'stale-token' })

    expect(await screen.findByRole('heading', { name: /sign in/i })).toBeInTheDocument()
    expect(localStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull()
  })

  it('redirects signed-in users away from the sign-in page', async () => {
    const customer = seedUser('customer')
    renderApp({ path: '/login', user: customer })

    expect(await screen.findByRole('heading', { name: /inventory/i })).toBeInTheDocument()
  })

  it('signs out', async () => {
    const customer = seedUser('customer')
    const { user } = renderApp({ path: '/', user: customer })

    await user.click(await screen.findByRole('button', { name: /sign out/i }))

    expect(await screen.findByRole('heading', { name: /sign in/i })).toBeInTheDocument()
    await waitFor(() => expect(localStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull())
  })
})
