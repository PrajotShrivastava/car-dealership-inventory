import { screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw/http'
import { describe, expect, it } from 'vitest'
import { API_URL } from '../../api/client'
import { getVehicle, seedUser, seedVehicle } from '../../test/handlers'
import { server } from '../../test/server'
import { renderApp } from '../../test/utils'

function renderAsCustomer() {
  return renderApp({ path: '/app', user: seedUser('customer') })
}

async function rows() {
  const list = await screen.findByRole('list', { name: /vehicles/i })
  return within(list).getAllByRole('listitem')
}

describe('inventory list', () => {
  it('shows each vehicle with price and stock status', async () => {
    seedVehicle({ make: 'Ford', model: 'Kuga', trim: 'ST-Line', price: '35990.00', quantity: 6 })
    seedVehicle({ make: 'Renault', model: 'Zoe', trim: null, price: '24990.00', quantity: 0 })
    renderAsCustomer()

    const [first, second] = await rows()
    // newest first
    expect(within(second).getByText('Ford Kuga')).toBeInTheDocument()
    expect(within(second).getByText('ST-Line')).toBeInTheDocument()
    expect(within(second).getByText('$35,990')).toBeInTheDocument()
    expect(within(second).getByText(/in stock · 6/i)).toBeInTheDocument()
    expect(within(first).getByText(/out of stock/i)).toBeInTheDocument()
  })

  it('explains an empty inventory', async () => {
    renderAsCustomer()

    expect(await screen.findByText(/no vehicles in inventory yet/i)).toBeInTheDocument()
  })

  it('shows an error with a retry when loading fails', async () => {
    server.use(
      http.get(`${API_URL}/vehicles/search`, () =>
        HttpResponse.json({ error: { code: 'HTTP_ERROR', message: 'Database unavailable' } }, { status: 503 }),
      ),
    )
    const { user } = renderAsCustomer()

    expect(await screen.findByText(/database unavailable/i)).toBeInTheDocument()
    server.resetHandlers()
    seedVehicle({ make: 'Tesla', model: 'Model 3' })
    await user.click(screen.getByRole('button', { name: /retry/i }))

    expect(await screen.findByText('Tesla Model 3')).toBeInTheDocument()
  })
})

describe('filtering and sorting', () => {
  it('filters by free-text search', async () => {
    seedVehicle({ make: 'Ford', model: 'Kuga' })
    seedVehicle({ make: 'Dacia', model: 'Duster' })
    const { user } = renderAsCustomer()
    await rows()

    await user.type(screen.getByRole('searchbox', { name: /search/i }), 'dust')

    await waitFor(() => expect(screen.queryByText('Ford Kuga')).not.toBeInTheDocument())
    expect(screen.getByText('Dacia Duster')).toBeInTheDocument()
  })

  it('filters by category and shows the active filter count', async () => {
    seedVehicle({ make: 'Ford', model: 'Kuga', category: 'suv' })
    seedVehicle({ make: 'Tesla', model: 'Model 3', category: 'sedan' })
    const { user } = renderAsCustomer()
    await rows()

    await user.selectOptions(screen.getByLabelText(/category/i), 'sedan')

    await waitFor(() => expect(screen.queryByText('Ford Kuga')).not.toBeInTheDocument())
    expect(screen.getByRole('heading', { name: /filters \(1\)/i })).toBeInTheDocument()
  })

  it('filters by availability and shows counts', async () => {
    seedVehicle({ make: 'Ford', model: 'Kuga', quantity: 2 })
    seedVehicle({ make: 'Renault', model: 'Zoe', quantity: 0 })
    seedVehicle({ make: 'BMW', model: '4 Series', quantity: 0 })
    const { user } = renderAsCustomer()
    await rows()

    const outOfStock = screen.getByRole('radio', { name: /out of stock/i })
    expect(outOfStock.closest('label')).toHaveTextContent('2')
    await user.click(outOfStock)

    await waitFor(() => expect(screen.queryByText('Ford Kuga')).not.toBeInTheDocument())
    expect(screen.getByText('Renault Zoe')).toBeInTheDocument()
  })

  it('filters by price range', async () => {
    seedVehicle({ make: 'Cheap', model: 'Car', price: '9000.00' })
    seedVehicle({ make: 'Pricey', model: 'Car', price: '90000.00' })
    const { user } = renderAsCustomer()
    await rows()

    await user.type(screen.getByLabelText(/max price/i), '20000')

    await waitFor(() => expect(screen.queryByText('Pricey Car')).not.toBeInTheDocument())
    expect(screen.getByText('Cheap Car')).toBeInTheDocument()
  })

  it('clears all filters and offers that when nothing matches', async () => {
    seedVehicle({ make: 'Ford', model: 'Kuga' })
    const { user } = renderAsCustomer()
    await rows()

    await user.type(screen.getByRole('searchbox', { name: /search/i }), 'lamborghini')
    expect(await screen.findByText(/no vehicles match/i)).toBeInTheDocument()
    await user.click(screen.getAllByRole('button', { name: /clear (all|filters)/i })[0])

    expect(await screen.findByText('Ford Kuga')).toBeInTheDocument()
    expect(screen.getByRole('searchbox', { name: /search/i })).toHaveValue('')
  })

  it('sorts by price', async () => {
    seedVehicle({ make: 'Mid', model: 'Car', price: '20000.00' })
    seedVehicle({ make: 'Low', model: 'Car', price: '10000.00' })
    seedVehicle({ make: 'High', model: 'Car', price: '30000.00' })
    const { user } = renderAsCustomer()
    await rows()

    await user.selectOptions(screen.getByLabelText(/sort by/i), 'price_asc')

    await waitFor(async () => {
      const titles = (await rows()).map((row) => within(row).getByRole('heading').textContent)
      expect(titles).toEqual(['Low Car', 'Mid Car', 'High Car'])
    })
  })

  it('paginates long result sets', async () => {
    for (let i = 1; i <= 25; i++) seedVehicle({ make: 'Make', model: `Model ${i}` })
    const { user } = renderAsCustomer()

    expect(await rows()).toHaveLength(20)
    expect(screen.getByText(/showing 1–20 of 25/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /next page/i }))

    expect(await screen.findByText(/showing 21–25 of 25/i)).toBeInTheDocument()
    expect(await rows()).toHaveLength(5)
  })
})

describe('vehicle details drawer and purchase', () => {
  it('opens details and closes with Escape', async () => {
    seedVehicle({ make: 'Ford', model: 'Kuga', trim: 'ST-Line', fuel_type: 'hybrid', year: 2024 })
    const { user } = renderAsCustomer()
    const [row] = await rows()

    await user.click(within(row).getByRole('button', { name: /view details/i }))
    const dialog = await screen.findByRole('dialog', { name: /ford kuga/i })
    expect(within(dialog).getByText('Hybrid')).toBeInTheDocument()
    expect(within(dialog).getByText('2024')).toBeInTheDocument()

    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('purchases a vehicle and updates stock everywhere', async () => {
    const vehicle = seedVehicle({ make: 'Ford', model: 'Kuga', price: '20000.00', quantity: 3 })
    const { user } = renderAsCustomer()
    const [row] = await rows()
    await user.click(within(row).getByRole('button', { name: /view details/i }))
    const dialog = await screen.findByRole('dialog')

    await user.click(within(dialog).getByRole('button', { name: /increase quantity/i }))
    expect(within(dialog).getByText('$40,000')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: /^purchase/i }))

    expect(await within(dialog).findByText(/purchase confirmed/i)).toBeInTheDocument()
    expect(getVehicle(vehicle.id)?.quantity).toBe(1)
    await waitFor(() => expect(within(row).getByText(/low stock · 1/i)).toBeInTheDocument())
  })

  it('limits the quantity to what is in stock', async () => {
    seedVehicle({ quantity: 2 })
    const { user } = renderAsCustomer()
    const [row] = await rows()
    await user.click(within(row).getByRole('button', { name: /view details/i }))
    const dialog = await screen.findByRole('dialog')

    const increase = within(dialog).getByRole('button', { name: /increase quantity/i })
    await user.click(increase)

    expect(within(dialog).getByLabelText('Quantity')).toHaveTextContent('2')
    expect(increase).toBeDisabled()
  })

  it('disables purchasing when out of stock', async () => {
    seedVehicle({ quantity: 0 })
    const { user } = renderAsCustomer()
    const [row] = await rows()
    await user.click(within(row).getByRole('button', { name: /view details/i }))
    const dialog = await screen.findByRole('dialog')

    expect(within(dialog).getByRole('button', { name: /out of stock/i })).toBeDisabled()
  })

  it('shows the server reason when a purchase is rejected', async () => {
    const vehicle = seedVehicle({ quantity: 1 })
    server.use(
      http.post(`${API_URL}/vehicles/${vehicle.id}/purchase`, () =>
        HttpResponse.json(
          { error: { code: 'OUT_OF_STOCK', message: '2024 Ford Kuga ST-Line is out of stock' } },
          { status: 409 },
        ),
      ),
    )
    const { user } = renderAsCustomer()
    const [row] = await rows()
    await user.click(within(row).getByRole('button', { name: /view details/i }))
    const dialog = await screen.findByRole('dialog')

    await user.click(within(dialog).getByRole('button', { name: /^purchase/i }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/out of stock/i)
  })
})
