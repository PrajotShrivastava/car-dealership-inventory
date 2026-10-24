import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { seedUser } from '../test/handlers'
import { renderApp } from '../test/utils'

function nav() {
  return screen.findByRole('navigation', { name: /primary/i })
}

describe('navbar', () => {
  it('links to every public section and the auth entry points', async () => {
    renderApp({ path: '/' })
    const primary = await nav()

    for (const [name, href] of [
      ['Home', '/'],
      ['Features', '/#features'],
      ['About', '/about'],
      ['Pricing', '/pricing'],
      ['Sign In', '/login'],
      ['Get Started', '/signup'],
    ]) {
      expect(within(primary).getByRole('link', { name })).toHaveAttribute('href', href)
    }
  })

  it('navigates between public pages', async () => {
    const { user, router } = renderApp({ path: '/' })

    await user.click(within(await nav()).getByRole('link', { name: 'Pricing' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/pricing'))
    expect(await screen.findByRole('heading', { level: 1, name: /pricing/i })).toBeInTheDocument()
  })

  it('has a mobile menu that opens and closes', async () => {
    const { user } = renderApp({ path: '/' })
    const toggle = within(await nav()).getByRole('button', { name: /open menu/i })

    await user.click(toggle)

    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    const menu = document.getElementById('mobile-menu')!
    expect(within(menu).getByRole('link', { name: 'About' })).toBeInTheDocument()
    expect(within(menu).getByRole('link', { name: 'Get Started' })).toBeInTheDocument()

    await user.click(within(menu).getByRole('link', { name: 'About' }))
    expect(document.getElementById('mobile-menu')).toBeNull()
  })

  it('offers the dashboard instead of sign-in to signed-in users', async () => {
    renderApp({ path: '/', user: seedUser('customer') })
    const primary = await nav()

    expect(await within(primary).findByRole('link', { name: 'Open dashboard' })).toHaveAttribute('href', '/app')
    expect(within(primary).queryByRole('link', { name: 'Sign In' })).not.toBeInTheDocument()
  })
})

describe('home page', () => {
  it('explains the product with clear calls to action', async () => {
    renderApp({ path: '/' })

    expect(await screen.findByRole('heading', { level: 1 })).toBeInTheDocument()
    const hero = screen.getByRole('region', { name: /introduction/i })
    expect(within(hero).getByRole('link', { name: /get started/i })).toHaveAttribute('href', '/signup')
    expect(within(hero).getByRole('link', { name: /sign in/i })).toHaveAttribute('href', '/login')
  })

  it('shows a dashboard preview clearly marked as sample data', async () => {
    renderApp({ path: '/' })

    const preview = await screen.findByRole('figure', { name: /dashboard preview/i })
    expect(within(preview).getByText(/sample data/i)).toBeInTheDocument()
    expect(within(preview).getAllByText(/in stock|low stock|out of stock/i).length).toBeGreaterThan(0)
  })

  it('has a features section that the Features link targets', async () => {
    renderApp({ path: '/' })

    const features = await screen.findByRole('region', { name: /features/i })
    expect(features).toHaveAttribute('id', 'features')
    expect(within(features).getAllByRole('heading', { level: 3 }).length).toBeGreaterThanOrEqual(6)
  })
})

describe('about page', () => {
  it('covers mission, purpose and audience', async () => {
    renderApp({ path: '/about' })

    expect(await screen.findByRole('heading', { level: 1, name: /about/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /mission/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /why/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /who it.s for/i })).toBeInTheDocument()
  })
})

describe('pricing page', () => {
  it('shows three plans clearly labelled as placeholders', async () => {
    renderApp({ path: '/pricing' })

    expect(await screen.findByRole('heading', { level: 1, name: /pricing/i })).toBeInTheDocument()
    expect(screen.getByRole('note')).toHaveTextContent(/placeholder/i)
    const plans = within(screen.getByRole('list', { name: /plans/i })).getAllByRole('listitem')
    expect(plans).toHaveLength(3)
    for (const plan of plans) {
      expect(within(plan).getByText(/placeholder/i)).toBeInTheDocument()
    }
  })

  it('sends plan buttons to sign-up, not to any checkout', async () => {
    renderApp({ path: '/pricing' })

    const plans = within(await screen.findByRole('list', { name: /plans/i })).getAllByRole('listitem')
    for (const plan of plans) {
      expect(within(plan).getByRole('link')).toHaveAttribute('href', '/signup')
    }
  })
})
