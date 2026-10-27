import { screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw/http'
import { describe, expect, it, vi } from 'vitest'
import { API_URL } from '../../api/client'
import { getLead, getLeads, seedLead, seedUser, seedVehicle } from '../../test/handlers'
import { server } from '../../test/server'
import { renderApp } from '../../test/utils'

async function openDetails(user: ReturnType<typeof renderApp>['user']) {
  const list = await screen.findByRole('list', { name: /vehicles/i })
  await user.click(within(list).getAllByRole('button', { name: /view details/i })[0])
  return screen.findByRole('dialog')
}

describe('my account', () => {
  it('is in the sidebar for customers only', async () => {
    renderApp({ path: '/app/inventory', user: seedUser('customer') })
    const nav = (await screen.findAllByRole('navigation', { name: 'Main' }))[0]
    expect(within(nav).getByRole('link', { name: 'My account' })).toBeInTheDocument()
  })

  it.each(['dealer', 'admin'] as const)('is not offered to a %s, and its URL sends them to the inventory', async (role) => {
    renderApp({ path: '/app/account', user: seedUser(role) })

    expect(await screen.findByRole('heading', { name: /inventory/i, level: 1 })).toBeInTheDocument()
    const nav = screen.getAllByRole('navigation', { name: 'Main' })[0]
    expect(within(nav).queryByRole('link', { name: 'My account' })).not.toBeInTheDocument()
  })

  it('shows a purchase straight after buying, with its invoice', async () => {
    const createObjectURL = vi.fn(() => 'blob:invoice')
    Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() })
    const dealer = seedUser('dealer')
    seedVehicle({ make: 'Kia', model: 'Seltos', year: 2025, price: '25000.00', quantity: 4 }, dealer)
    const { user } = renderApp({ path: '/app', user: seedUser('customer') })
    const dialog = await openDetails(user)

    await user.click(within(dialog).getByRole('button', { name: 'Increase quantity' }))
    await user.click(within(dialog).getByRole('button', { name: /^purchase/i }))
    await user.click(await within(dialog).findByRole('link', { name: 'Get the invoice in My account' }))

    const purchases = await screen.findByRole('list', { name: 'Purchases' })
    const [row] = within(purchases).getAllByRole('listitem')
    expect(row).toHaveTextContent('2025 Kia Seltos')
    expect(row).toHaveTextContent('Sold by Test dealer')
    expect(row).toHaveTextContent('$50,000')
    expect(row).toHaveTextContent('2 × $25,000')
    expect(screen.getByRole('heading', { name: 'Purchases (1)' })).toBeInTheDocument()

    await user.click(within(row).getByRole('button', { name: /download invoice INV-/i }))
    await waitFor(() => expect(createObjectURL).toHaveBeenCalled())
  })

  it('reports an invoice that could not be downloaded', async () => {
    const dealer = seedUser('dealer')
    seedVehicle({}, dealer)
    server.use(
      http.get(`${API_URL}/account/purchases/:id/invoice`, () =>
        HttpResponse.json({ error: { code: 'PURCHASE_NOT_FOUND', message: 'Purchase 9 not found' } }, { status: 404 }),
      ),
    )
    const { user } = renderApp({ path: '/app', user: seedUser('customer') })
    const dialog = await openDetails(user)
    await user.click(within(dialog).getByRole('button', { name: /^purchase/i }))
    await user.click(await within(dialog).findByRole('link', { name: 'Get the invoice in My account' }))

    const purchases = await screen.findByRole('list', { name: 'Purchases' })
    await user.click(within(purchases).getByRole('button', { name: /download invoice/i }))

    expect(await within(purchases).findByRole('alert')).toHaveTextContent('Purchase 9 not found')
  })

  it('tracks enquiries as the dealer moves them along, without the dealer’s notes', async () => {
    const dealer = seedUser('dealer')
    const customer = seedUser('customer')
    seedVehicle({ make: 'Kia', model: 'Seltos', year: 2025 }, dealer)
    const { user } = renderApp({ path: '/app', user: customer })
    const dialog = await openDetails(user)
    await user.click(within(dialog).getByRole('button', { name: 'Book a test drive' }))
    await user.type(within(dialog).getByLabelText('Preferred date'), '2099-03-14')
    await user.click(within(dialog).getByRole('button', { name: 'Request test drive' }))
    const track = await within(dialog).findByRole('link', { name: 'Track it in My account' })

    // Meanwhile the dealer books the test drive and writes a private note.
    const [enquiry] = getLeads()
    Object.assign(getLead(enquiry.id)!, { status: 'test_drive_scheduled', notes: 'Offer $500 off' })
    await user.click(track)

    const list = await screen.findByRole('list', { name: 'Enquiries' })
    const [row] = within(list).getAllByRole('listitem')
    expect(row).toHaveTextContent('Test drive request · 2025 Kia Seltos')
    expect(row).toHaveTextContent('Test drive booked')
    expect(row).toHaveTextContent('The dealer has arranged your test drive.')
    expect(screen.queryByText(/offer \$500 off/i)).not.toBeInTheDocument()
  })

  it('explains empty purchases and enquiries', async () => {
    renderApp({ path: '/app/account', user: seedUser('customer') })

    expect(await screen.findByText('No purchases yet')).toBeInTheDocument()
    expect(await screen.findByText('No enquiries yet')).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'Browse vehicles' })).toHaveLength(2)
  })

  it('shows more enquiries on request', async () => {
    const dealer = seedUser('dealer')
    const customer = seedUser('customer')
    const lead = { customer_id: customer.id, enquiry_kind: 'question' as const }
    for (let i = 0; i < 12; i++) seedLead(dealer, { ...lead, vehicle_label: `Car ${i}` })
    const { user } = renderApp({ path: '/app/account', user: customer })

    const list = await screen.findByRole('list', { name: 'Enquiries' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(10)
    expect(screen.getByRole('heading', { name: 'Enquiries (12)' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Show more' }))

    await waitFor(() => expect(within(list).getAllByRole('listitem')).toHaveLength(12))
    expect(screen.queryByRole('button', { name: 'Show more' })).not.toBeInTheDocument()
  })
})
