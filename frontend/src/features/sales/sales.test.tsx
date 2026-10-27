import { screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw/http'
import { describe, expect, it, vi } from 'vitest'
import { API_URL } from '../../api/client'
import type { User } from '../../api/types'
import { getLead, getSales, getVehicle, localDate, seedLead, seedSale, seedUser, seedVehicle } from '../../test/handlers'
import { server } from '../../test/server'
import { renderApp } from '../../test/utils'

function asDealer(path = '/app/sales', dealer: User = seedUser('dealer')) {
  return { dealer, ...renderApp({ path, user: dealer }) }
}

const history = () => screen.getByRole('table', { name: 'Sales history' })
const rows = () => within(history()).getAllByRole('row').slice(1)
const totals = (name: string) => within(screen.getByRole('region', { name: 'Sales summary' })).getByRole('group', { name })

describe('sales history', () => {
  it('lists the dealer’s sales with price, cost, profit and customer', async () => {
    const dealer = seedUser('dealer')
    seedSale(dealer, { id: 501, quantity: 2, unit_price: '31000.00', total_price: '62000.00', unit_cost: '24000.00', gross_profit: '14000.00' })
    seedSale(dealer, { id: 502, vehicle_label: '2023 Renault Zoe', customer: { name: 'Ben Cole', email: null, phone: null }, sold_at: '2026-09-01T12:00:00Z' })
    asDealer('/app/sales', dealer)

    await screen.findByRole('table', { name: 'Sales history' })
    expect(rows()).toHaveLength(2)
    expect(rows()[0]).toHaveTextContent('2024 Ford Kuga ST-Line')
    expect(rows()[0]).toHaveTextContent('Priya Shah')
    expect(rows()[0]).toHaveTextContent('$62,000')
    expect(rows()[0]).toHaveTextContent('$14,000')
    expect(rows()[0]).toHaveTextContent('#501')
    // No cost recorded: profit is unknown, never shown as $0.
    expect(within(rows()[1]!).getAllByText('—').length).toBeGreaterThan(0)
  })

  it('totals revenue and labels profit as covering only sales with a cost', async () => {
    const dealer = seedUser('dealer')
    seedSale(dealer, { total_price: '62000.00', unit_cost: '24000.00', gross_profit: '14000.00' })
    seedSale(dealer, { total_price: '18000.00' })
    asDealer('/app/sales', dealer)

    expect(await within(await screen.findByRole('group', { name: 'Completed sales' })).findByText('2')).toBeInTheDocument()
    expect(within(totals('Revenue')).getByText('$80,000')).toBeInTheDocument()
    expect(within(totals('Gross profit')).getByText('$14,000')).toBeInTheDocument()
    expect(totals('Gross profit')).toHaveTextContent('From 1 of 2 sales with a recorded cost')
  })

  it('searches and filters by vehicle', async () => {
    const dealer = seedUser('dealer')
    const zoe = seedVehicle({ make: 'Renault', model: 'Zoe' }, dealer)
    seedSale(dealer, { customer: { name: 'Asha Rao', email: null, phone: null } })
    seedSale(dealer, { vehicle_id: zoe.id, vehicle_label: '2024 Renault Zoe', customer: { name: 'Chen Wu', email: null, phone: null } })
    const { user } = asDealer('/app/sales', dealer)

    await screen.findByRole('table', { name: 'Sales history' })
    await user.type(screen.getByRole('searchbox', { name: 'Search sales' }), 'asha')
    await waitFor(() => expect(rows()).toHaveLength(1))
    expect(rows()[0]).toHaveTextContent('Asha Rao')

    await user.clear(screen.getByRole('searchbox', { name: 'Search sales' }))
    await user.selectOptions(screen.getByLabelText('Vehicle'), String(zoe.id))
    await waitFor(() => expect(rows()).toHaveLength(1))
    expect(rows()[0]).toHaveTextContent('Chen Wu')
  })

  it('shows an empty state, and a different one when filters match nothing', async () => {
    const dealer = seedUser('dealer')
    const { user } = asDealer('/app/sales', dealer)

    expect(await screen.findByText('No sales yet')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Record sale' }).length).toBeGreaterThan(0)

    seedSale(dealer)
    await user.type(screen.getByRole('searchbox', { name: 'Search sales' }), 'nobody')
    expect(await screen.findByText('No sales match your filters')).toBeInTheDocument()
  })

  it('pages through long histories', async () => {
    const dealer = seedUser('dealer')
    for (let i = 0; i < 25; i++) seedSale(dealer, { sold_at: `2026-10-${String(1 + (i % 20)).padStart(2, '0')}T12:00:00Z` })
    const { user } = asDealer('/app/sales', dealer)

    await screen.findByRole('table', { name: 'Sales history' })
    expect(rows()).toHaveLength(20)
    expect(screen.getByText('Showing 1–20 of 25')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Next page' }))
    await waitFor(() => expect(rows()).toHaveLength(5))
  })

  it('opens a sale and downloads its invoice', async () => {
    const dealer = seedUser('dealer')
    const sale = seedSale(dealer, { id: 777 })
    const createObjectURL = vi.fn(() => 'blob:invoice')
    const revokeObjectURL = vi.fn()
    Object.assign(URL, { createObjectURL, revokeObjectURL })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const { user } = asDealer('/app/sales', dealer)

    await screen.findByRole('table', { name: 'Sales history' })
    await user.click(within(rows()[0]!).getByRole('button', { name: /view sale #777/i }))
    const drawer = await screen.findByRole('dialog', { name: 'Sale #777' })
    expect(drawer).toHaveTextContent('Priya Shah')
    expect(drawer).toHaveTextContent('Revenue')
    expect(drawer).toHaveTextContent('Gross profit')

    await user.click(within(drawer).getByRole('button', { name: 'Download invoice' }))
    await waitFor(() => expect(click).toHaveBeenCalled())
    expect(createObjectURL).toHaveBeenCalled()
    expect(sale.id).toBe(777)
    click.mockRestore()
  })

  it('keeps sales out of reach of customers', async () => {
    const { router } = renderApp({ path: '/app/sales', user: seedUser('customer') })

    await waitFor(() => expect(router.state.location.pathname).toBe('/app/inventory'))
  })
})

describe('recording a sale', () => {
  async function openForm(user: ReturnType<typeof renderApp>['user']) {
    await user.click((await screen.findAllByRole('button', { name: 'Record sale' }))[0]!)
    return screen.findByRole('dialog', { name: 'Record sale' })
  }

  it('records a sale after confirmation and takes the units out of stock', async () => {
    const dealer = seedUser('dealer')
    const kuga = seedVehicle({ make: 'Ford', model: 'Kuga', price: '30000.00', quantity: 3, acquisition_cost: '24000.00' }, dealer)
    const { user } = asDealer('/app/sales', dealer)

    const form = await openForm(user)
    await user.selectOptions(within(form).getByLabelText('Vehicle'), String(kuga.id))
    expect(within(form).getByLabelText('Selling price per unit (USD)')).toHaveValue(30000)
    await user.clear(within(form).getByLabelText('Quantity'))
    await user.type(within(form).getByLabelText('Quantity'), '2')
    await user.clear(within(form).getByLabelText('Selling price per unit (USD)'))
    await user.type(within(form).getByLabelText('Selling price per unit (USD)'), '31000')
    await user.type(within(form).getByLabelText('Customer name'), 'Priya Shah')
    await user.type(within(form).getByLabelText('Customer email (optional)'), 'priya@example.com')
    expect(within(form).getByText('$62,000')).toBeInTheDocument()
    expect(within(form).getByText('$14,000')).toBeInTheDocument()

    await user.click(within(form).getByRole('button', { name: 'Review sale' }))
    const confirm = await screen.findByRole('alertdialog', { name: 'Complete this sale?' })
    expect(confirm).toHaveTextContent('2 × 2024 Ford Kuga ST-Line')
    expect(confirm).toHaveTextContent('$62,000')
    await user.click(within(confirm).getByRole('button', { name: 'Complete sale' }))

    expect(await screen.findByRole('status')).toHaveTextContent(/sale #\d+ recorded/i)
    expect(getVehicle(kuga.id)!.quantity).toBe(1)
    expect(getSales()).toHaveLength(1)
    expect(await screen.findByRole('table', { name: 'Sales history' })).toHaveTextContent('Priya Shah')
  })

  it('says profit is unknown when the vehicle has no cost', async () => {
    const dealer = seedUser('dealer')
    const zoe = seedVehicle({ make: 'Renault', model: 'Zoe', quantity: 1 }, dealer)
    const { user } = asDealer('/app/sales', dealer)

    const form = await openForm(user)
    await user.selectOptions(within(form).getByLabelText('Vehicle'), String(zoe.id))

    expect(form).toHaveTextContent(/profit unknown/i)
  })

  it('validates before asking for confirmation', async () => {
    const dealer = seedUser('dealer')
    seedVehicle({ quantity: 1 }, dealer)
    const { user } = asDealer('/app/sales', dealer)

    const form = await openForm(user)
    await user.click(within(form).getByRole('button', { name: 'Review sale' }))

    expect(within(form).getByText('Choose a vehicle')).toBeInTheDocument()
    expect(within(form).getByText('Customer name is required')).toBeInTheDocument()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('shows the server’s reason when the sale fails, and retries with the same request', async () => {
    const dealer = seedUser('dealer')
    const kuga = seedVehicle({ quantity: 1 }, dealer)
    const requests: string[] = []
    let calls = 0
    server.use(
      http.post(`${API_URL}/sales`, async ({ request }) => {
        requests.push(((await request.json()) as { request_id: string }).request_id)
        return ++calls === 1
          ? HttpResponse.json({ error: { code: 'OUT_OF_STOCK', message: 'Ford Kuga is out of stock' } }, { status: 409 })
          : HttpResponse.json({ error: { code: 'OUT_OF_STOCK', message: 'Still out of stock' } }, { status: 409 })
      }),
    )
    const { user } = asDealer('/app/sales', dealer)

    const form = await openForm(user)
    await user.selectOptions(within(form).getByLabelText('Vehicle'), String(kuga.id))
    await user.type(within(form).getByLabelText('Customer name'), 'Priya Shah')
    for (let attempt = 0; attempt < 2; attempt++) {
      await user.click(within(form).getByRole('button', { name: 'Review sale' }))
      await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Complete sale' }))
      expect(await within(form).findByRole('alert')).toHaveTextContent(/out of stock/i)
    }
    expect(requests).toHaveLength(2)
    expect(requests[0]).toBe(requests[1])
  })

  it('starts from a lead: customer and vehicle filled in, and the lead converts', async () => {
    const dealer = seedUser('dealer')
    const kuga = seedVehicle({ make: 'Ford', model: 'Kuga', quantity: 2 }, dealer)
    const lead = seedLead(dealer, { name: 'Arjun Mehta', email: 'arjun@example.com', vehicle_id: kuga.id, status: 'negotiation' })
    const { user } = asDealer(`/app/leads?lead=${lead.id}`, dealer)

    const details = await screen.findByRole('dialog', { name: 'Arjun Mehta' })
    await user.click(within(details).getByRole('button', { name: 'Record sale' }))
    const form = await screen.findByRole('dialog', { name: 'Record sale' })
    // The vehicle options load after the drawer opens.
    await waitFor(() => expect(within(form).getByLabelText('Vehicle')).toHaveValue(String(kuga.id)))
    expect(within(form).getByLabelText('Customer name')).toHaveValue('Arjun Mehta')
    expect(within(form).getByLabelText('Lead (optional)')).toHaveValue(String(lead.id))

    await user.click(within(form).getByRole('button', { name: 'Review sale' }))
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Complete sale' }))

    await screen.findByText(/sale #\d+ recorded/i)
    expect(getLead(lead.id)!.status).toBe('converted')
    expect(getLead(lead.id)!.sale_id).toBe(getSales()[0]!.id)
  })

  it('starts from a vehicle in the inventory', async () => {
    const dealer = seedUser('dealer')
    const kuga = seedVehicle({ make: 'Ford', model: 'Kuga', quantity: 2 }, dealer)
    const { user } = asDealer(`/app/inventory?vehicle=${kuga.id}`, dealer)

    const drawer = await screen.findByRole('dialog', { name: 'Ford Kuga' })
    expect(within(drawer).queryByRole('button', { name: 'Purchase' })).not.toBeInTheDocument()
    await user.click(within(drawer).getByRole('button', { name: 'Record sale' }))

    const form = await screen.findByRole('dialog', { name: 'Record sale' })
    // The vehicle options load after the drawer opens.
    await waitFor(() => expect(within(form).getByLabelText('Vehicle')).toHaveValue(String(kuga.id)))
  })

  it('does not allow a future sale date', async () => {
    const dealer = seedUser('dealer')
    seedVehicle({ quantity: 1 }, dealer)
    const { user } = asDealer('/app/sales', dealer)

    const form = await openForm(user)
    const date = within(form).getByLabelText('Sale date')
    expect(date).toHaveValue(localDate())
    expect(date).toHaveAttribute('max', localDate())
    await user.clear(date)
    await user.type(date, localDate(3))
    await user.click(within(form).getByRole('button', { name: 'Review sale' }))
    expect(within(form).getByText('The sale date can’t be in the future')).toBeInTheDocument()
  })
})
