import { act, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { approveElsewhere, getApplication, PASSWORD, seedApplication, seedUser } from '../../test/handlers'
import { renderApp } from '../../test/utils'

describe('dealer sign-in entry point', () => {
  it('offers a clearly visible Dealer Sign In option on the login page', async () => {
    const { user, router } = renderApp({ path: '/login' })

    await user.click(await screen.findByRole('tab', { name: /dealer sign in/i }))

    expect(screen.getByRole('heading', { name: /dealer sign in/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /register as a dealer/i })).toHaveAttribute('href', '/dealer/register')
    expect(router.state.location.search).toBe('?as=dealer')
  })

  it('opens in dealer mode from /login?as=dealer and in customer mode by default', async () => {
    renderApp({ path: '/login?as=dealer' })

    expect(await screen.findByRole('tab', { name: /dealer sign in/i })).toHaveAttribute('aria-selected', 'true')
    expect(screen.queryByRole('link', { name: /create an account/i })).not.toBeInTheDocument()
  })

  it('keeps customer sign-up separate in customer mode', async () => {
    renderApp({ path: '/login' })

    expect(await screen.findByRole('tab', { name: /customer/i })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('link', { name: /create an account/i })).toHaveAttribute('href', '/signup')
  })

  it('signs an approved dealer (admin) in to the management view', async () => {
    seedUser('admin', 'dealer@example.com')
    const { user } = renderApp({ path: '/login?as=dealer' })

    await user.type(await screen.findByLabelText(/email/i), 'dealer@example.com')
    await user.type(screen.getByLabelText(/password/i), PASSWORD)
    await user.click(screen.getByRole('button', { name: /^sign in/i }))

    expect(await screen.findByRole('button', { name: /add vehicle/i })).toBeInTheDocument()
  })
})

describe('dealer registration', () => {
  async function fillForm(user: ReturnType<typeof renderApp>['user'], overrides: Record<string, string> = {}) {
    const values = {
      'Full name': 'Dana Dealer',
      Email: 'dana@motors.example',
      Password: 'dealer-pass-1',
      'Dealership name': 'Dana Motors',
      ...overrides,
    }
    for (const [label, value] of Object.entries(values)) {
      if (value) await user.type(await screen.findByLabelText(new RegExp(`^${label}`, 'i')), value)
    }
  }

  it('submits an application, signs the applicant in and shows it as pending', async () => {
    const { user, router } = renderApp({ path: '/dealer/register' })
    expect(await screen.findByRole('heading', { name: /register as a dealer/i })).toBeInTheDocument()

    await fillForm(user)
    await user.click(screen.getByRole('button', { name: /submit application/i }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/app'))
    expect(await screen.findByRole('status', { name: /dealer application/i })).toHaveTextContent(/pending/i)
    expect(screen.queryByRole('button', { name: /add vehicle/i })).not.toBeInTheDocument()
  })

  it('requires the dealership name and validates the rest', async () => {
    const { user } = renderApp({ path: '/dealer/register' })

    await fillForm(user, { 'Dealership name': '', Password: 'short' })
    await user.click(screen.getByRole('button', { name: /submit application/i }))

    expect(screen.getByText(/dealership name is required/i)).toBeInTheDocument()
    expect(screen.getByText(/at least 8 characters/i)).toBeInTheDocument()
  })

  it('reports an email that is already registered', async () => {
    seedUser('customer', 'dana@motors.example')
    const { user } = renderApp({ path: '/dealer/register' })

    await fillForm(user)
    await user.click(screen.getByRole('button', { name: /submit application/i }))

    expect(await screen.findByText(/already exists/i)).toBeInTheDocument()
  })

  it('is linked from customer sign-up and kept separate from it', async () => {
    renderApp({ path: '/signup' })

    expect(await screen.findByRole('link', { name: /register as a dealer/i })).toHaveAttribute('href', '/dealer/register')
    expect(screen.queryByLabelText(/dealership name/i)).not.toBeInTheDocument()
  })
})

describe('application status banner', () => {
  it('shows a rejected application with the reviewer note', async () => {
    const applicant = seedUser('customer', 'dana@motors.example')
    seedApplication(applicant, { status: 'rejected', review_note: 'Could not verify the business.' })
    renderApp({ path: '/app', user: applicant })

    const banner = await screen.findByRole('status', { name: /dealer application/i })
    expect(banner).toHaveTextContent(/not approved/i)
    expect(banner).toHaveTextContent('Could not verify the business.')
  })

  it('picks up an approval while the applicant is still signed in, without signing out', async () => {
    const applicant = seedUser('customer', 'dana@motors.example')
    const application = seedApplication(applicant)
    renderApp({ path: '/app', user: applicant })
    expect(await screen.findByRole('status', { name: /dealer application/i })).toHaveTextContent(/pending review/i)
    expect(screen.queryByRole('button', { name: /add vehicle/i })).not.toBeInTheDocument()

    approveElsewhere(application.id)
    // The applicant comes back to the tab.
    act(() => {
      window.dispatchEvent(new Event('visibilitychange'))
    })

    expect(await screen.findByRole('button', { name: /add vehicle/i })).toBeInTheDocument()
    expect(screen.queryByRole('status', { name: /dealer application/i })).not.toBeInTheDocument()
    expect(screen.getByText('admin')).toBeInTheDocument()
  })

  it('is absent for ordinary customers', async () => {
    renderApp({ path: '/app', user: seedUser('customer') })

    await screen.findByRole('heading', { name: /^inventory$/i })
    await waitFor(() => expect(screen.queryByRole('status', { name: /dealer application/i })).not.toBeInTheDocument())
  })
})

describe('admin review of dealer applications', () => {
  it('shows admins a navigation item with the pending count', async () => {
    seedApplication(seedUser('customer', 'a@x.example'))
    seedApplication(seedUser('customer', 'b@x.example'), { status: 'approved' })
    renderApp({ path: '/app', user: seedUser('admin') })

    const link = await screen.findByRole('link', { name: /dealer applications/i })
    expect(link).toHaveAttribute('href', '/app/dealer-applications')
    await waitFor(() => expect(link).toHaveTextContent('1'))
  })

  it('hides the page and navigation item from customers', async () => {
    const { router } = renderApp({ path: '/app/dealer-applications', user: seedUser('customer') })

    await waitFor(() => expect(router.state.location.pathname).toBe('/app'))
    expect(screen.queryByRole('link', { name: /dealer applications/i })).not.toBeInTheDocument()
  })

  it('approves a pending application after confirmation', async () => {
    const applicant = seedUser('customer', 'dana@motors.example')
    const application = seedApplication(applicant, { business_name: 'Dana Motors', phone: '+44 20 7946 0000' })
    const { user } = renderApp({ path: '/app/dealer-applications', user: seedUser('admin') })

    const card = (await screen.findByText('Dana Motors')).closest('li')!
    expect(within(card).getByText('dana@motors.example')).toBeInTheDocument()
    await user.click(within(card).getByRole('button', { name: /approve/i }))
    const confirm = await screen.findByRole('alertdialog', { name: /approve dana motors/i })
    await user.click(within(confirm).getByRole('button', { name: /^approve$/i }))

    await waitFor(() => expect(getApplication(application.id)?.status).toBe('approved'))
    await waitFor(() => expect(screen.queryByText('Dana Motors')).not.toBeInTheDocument())
  })

  it('rejects an application with an optional note', async () => {
    const application = seedApplication(seedUser('customer', 'dana@motors.example'), { business_name: 'Dana Motors' })
    const { user } = renderApp({ path: '/app/dealer-applications', user: seedUser('admin') })

    const card = (await screen.findByText('Dana Motors')).closest('li')!
    await user.click(within(card).getByRole('button', { name: /reject/i }))
    const confirm = await screen.findByRole('alertdialog', { name: /reject dana motors/i })
    await user.type(within(confirm).getByLabelText(/note/i), 'Incomplete details')
    await user.click(within(confirm).getByRole('button', { name: /^reject$/i }))

    await waitFor(() => expect(getApplication(application.id)?.status).toBe('rejected'))
    expect(getApplication(application.id)?.review_note).toBe('Incomplete details')
  })

  it('explains when there is nothing to review', async () => {
    renderApp({ path: '/app/dealer-applications', user: seedUser('admin') })

    expect(await screen.findByText(/no pending applications/i)).toBeInTheDocument()
  })
})
