import { screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw/http'
import { describe, expect, it } from 'vitest'
import { API_URL } from '../../api/client'
import { getVehicle, seedUser, seedVehicle } from '../../test/handlers'
import { server } from '../../test/server'
import { renderApp } from '../../test/utils'

const VIN = '1HGCM82633A004352'

async function rows() {
  const list = await screen.findByRole('list', { name: /vehicles/i })
  return within(list).getAllByRole('listitem')
}

async function openAddVehicle(user: ReturnType<typeof renderApp>['user']) {
  await user.click(await screen.findByRole('button', { name: 'Add vehicle' }))
  const dialog = await screen.findByRole('dialog', { name: /add vehicle/i })
  await user.type(within(dialog).getByLabelText(/^make/i), 'Honda')
  await user.type(within(dialog).getByLabelText(/^model/i), 'Accord')
  await user.type(within(dialog).getByLabelText(/^price/i), '18990')
  return dialog
}

describe('vehicle details: condition, mileage, colour, VIN, features', () => {
  it('adds a used car with every detail and shows them to customers', async () => {
    const dealer = seedUser('dealer')
    const { user } = renderApp({ path: '/app/inventory', user: dealer })
    seedVehicle({ make: 'Ford', model: 'Kuga' }, dealer)
    const dialog = await openAddVehicle(user)

    await user.selectOptions(within(dialog).getByLabelText('Condition'), 'used')
    await user.type(within(dialog).getByLabelText('Mileage'), '42150')
    await user.type(within(dialog).getByLabelText(/^colour/i), 'Midnight Blue')
    await user.type(within(dialog).getByLabelText(/^vin/i), '1hgcm8-2633a004352')
    const stock = within(dialog).getByLabelText(/initial stock/i)
    await user.clear(stock)
    await user.type(stock, '1')
    await user.type(within(dialog).getByLabelText(/^features/i), 'Sunroof, Heated seats, sunroof')
    await user.click(within(dialog).getByRole('button', { name: /create vehicle/i }))

    const list = await screen.findByRole('list', { name: /vehicles/i })
    const row = (await within(list).findByText('Honda Accord')).closest('li')!
    expect(within(row).getByText(/Used • 42,150 mi • Sedan/)).toBeInTheDocument()

    await user.click(within(row).getByRole('button', { name: /view details/i }))
    const details = await screen.findByRole('dialog', { name: /honda accord/i })
    expect(within(details).getByText('Midnight Blue')).toBeInTheDocument()
    expect(within(details).getByText(VIN)).toBeInTheDocument()
    expect(within(details).getByText('42,150 mi')).toBeInTheDocument()
    const features = within(details).getByRole('list', { name: 'Features' })
    expect(within(features).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Sunroof', 'Heated seats'])
  })

  it('checks the new fields before saving', async () => {
    const { user } = renderApp({ path: '/app/inventory', user: seedUser('dealer') })
    const dialog = await openAddVehicle(user)

    await user.selectOptions(within(dialog).getByLabelText('Condition'), 'certified')
    await user.type(within(dialog).getByLabelText(/^vin/i), 'NOT-A-VIN')
    await user.click(within(dialog).getByRole('button', { name: /create vehicle/i }))

    expect(within(dialog).getByText('Mileage is required for used and certified vehicles')).toBeInTheDocument()
    expect(within(dialog).getByText(/vin must be 17 letters and digits/i)).toBeInTheDocument()

    const vin = within(dialog).getByLabelText(/^vin/i)
    await user.clear(vin)
    await user.type(vin, VIN)
    const stock = within(dialog).getByLabelText(/initial stock/i)
    await user.clear(stock)
    await user.type(stock, '3')
    await user.click(within(dialog).getByRole('button', { name: /create vehicle/i }))

    expect(within(dialog).getByText(/single car, so its stock can be at most 1/i)).toBeInTheDocument()
  })

  it('shows a VIN already in the inventory next to the VIN field', async () => {
    server.use(
      http.post(`${API_URL}/vehicles`, () =>
        HttpResponse.json(
          { error: { code: 'VIN_TAKEN', message: `A vehicle with VIN ${VIN} is already in the inventory` } },
          { status: 409 },
        ),
      ),
    )
    const { user } = renderApp({ path: '/app/inventory', user: seedUser('dealer') })
    const dialog = await openAddVehicle(user)
    await user.type(within(dialog).getByLabelText(/^vin/i), VIN)
    const stock = within(dialog).getByLabelText(/initial stock/i)
    await user.clear(stock)
    await user.type(stock, '1')
    await user.click(within(dialog).getByRole('button', { name: /create vehicle/i }))

    const vin = within(dialog).getByLabelText(/^vin/i)
    await waitFor(() => expect(vin).toHaveAccessibleDescription(/already in the inventory/i))
  })

  it('keeps the details when another field is edited', async () => {
    const dealer = seedUser('dealer')
    const vehicle = seedVehicle(
      { make: 'Ford', model: 'Kuga', quantity: 1, condition: 'used', mileage: 9000, colour: 'Red', vin: VIN, features: ['Sunroof'] },
      dealer,
    )
    const { user } = renderApp({ path: '/app/inventory', user: dealer })
    const [row] = await rows()
    await user.click(within(row).getByRole('button', { name: /view details/i }))
    const dialog = await screen.findByRole('dialog', { name: /ford kuga/i })

    await user.click(within(dialog).getByRole('tab', { name: /edit/i }))
    const price = within(dialog).getByLabelText(/^price/i)
    await user.clear(price)
    await user.type(price, '30000')
    await user.click(within(dialog).getByRole('button', { name: /save changes/i }))

    expect(await within(dialog).findByText(/changes saved/i)).toBeInTheDocument()
    expect(getVehicle(vehicle.id)).toMatchObject({
      price: '30000.00',
      condition: 'used',
      mileage: 9000,
      colour: 'Red',
      vin: VIN,
      features: ['Sunroof'],
    })
  })

  it('filters by condition and maximum mileage, and sorts by mileage', async () => {
    seedVehicle({ model: 'Fresh' })
    seedVehicle({ model: 'Low', condition: 'used', mileage: 8000 })
    seedVehicle({ model: 'High', condition: 'certified', mileage: 90_000 })
    const { user } = renderApp({ path: '/app', user: seedUser('customer') })
    expect(await rows()).toHaveLength(3)

    await user.selectOptions(screen.getByLabelText('Condition'), 'certified')
    await waitFor(async () => expect((await rows()).map((r) => within(r).getByRole('heading').textContent)).toEqual(['Ford High']))

    await user.selectOptions(screen.getByLabelText('Condition'), '')
    await user.selectOptions(screen.getByLabelText('Max mileage'), '10000')
    await waitFor(async () => expect(await rows()).toHaveLength(2))
    expect(screen.getByRole('heading', { name: 'Filters (1)' })).toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('Max mileage'), '')
    await user.selectOptions(screen.getByLabelText(/sort/i), 'mileage_asc')
    await waitFor(async () =>
      expect((await rows()).map((r) => within(r).getByRole('heading').textContent)).toEqual(['Ford Fresh', 'Ford Low', 'Ford High']),
    )
  })

  it('reads the new filters from a shared link', async () => {
    seedVehicle({ model: 'Fresh' })
    seedVehicle({ model: 'Low', condition: 'used', mileage: 8000 })
    renderApp({ path: '/app/inventory?condition=used&max_mileage=10000', user: seedUser('customer') })

    await waitFor(async () => expect(await rows()).toHaveLength(1))
    expect(screen.getByLabelText('Condition')).toHaveValue('used')
    expect(screen.getByLabelText('Max mileage')).toHaveValue('10000')
  })
})
