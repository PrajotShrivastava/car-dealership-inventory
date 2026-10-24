import { screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw/http'
import { describe, expect, it } from 'vitest'
import { API_URL } from '../../api/client'
import { getVehicle, seedUser, seedVehicle } from '../../test/handlers'
import { server } from '../../test/server'
import { renderApp } from '../../test/utils'

async function openDetails(user: ReturnType<typeof renderApp>['user'], title: string) {
  const list = await screen.findByRole('list', { name: /vehicles/i })
  const row = within(list).getByText(title).closest('li')!
  await user.click(within(row).getByRole('button', { name: /view details/i }))
  return screen.findByRole('dialog', { name: new RegExp(title, 'i') })
}

describe('customer experience', () => {
  it('hides every admin control', async () => {
    seedVehicle({ make: 'Ford', model: 'Kuga' })
    const { user } = renderApp({ path: '/app', user: seedUser('customer') })

    const dialog = await openDetails(user, 'Ford Kuga')

    expect(screen.queryByRole('button', { name: /add vehicle/i })).not.toBeInTheDocument()
    expect(within(dialog).queryByRole('tab')).not.toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: /delete/i })).not.toBeInTheDocument()
  })
})

describe('admin: add vehicle', () => {
  it('creates a vehicle that then appears in the list', async () => {
    const { user } = renderApp({ path: '/app', user: seedUser('admin') })

    await user.click(await screen.findByRole('button', { name: /add vehicle/i }))
    const dialog = await screen.findByRole('dialog', { name: /add vehicle/i })
    await user.type(within(dialog).getByLabelText(/^make/i), 'Skoda')
    await user.type(within(dialog).getByLabelText(/^model/i), 'Octavia')
    await user.type(within(dialog).getByLabelText(/^trim/i), 'Style')
    await user.clear(within(dialog).getByLabelText(/^year/i))
    await user.type(within(dialog).getByLabelText(/^year/i), '2024')
    await user.selectOptions(within(dialog).getByLabelText(/^category/i), 'wagon')
    await user.selectOptions(within(dialog).getByLabelText(/^fuel/i), 'diesel')
    await user.selectOptions(within(dialog).getByLabelText(/^transmission/i), 'manual')
    await user.type(within(dialog).getByLabelText(/^price/i), '27990')
    await user.clear(within(dialog).getByLabelText(/initial stock/i))
    await user.type(within(dialog).getByLabelText(/initial stock/i), '4')
    await user.click(within(dialog).getByRole('button', { name: /create vehicle/i }))

    const list = await screen.findByRole('list', { name: /vehicles/i })
    expect(await within(list).findByText('Skoda Octavia')).toBeInTheDocument()
    expect(within(list).getByText(/in stock · 4/i)).toBeInTheDocument()
  })

  it('validates input before sending', async () => {
    const { user } = renderApp({ path: '/app', user: seedUser('admin') })

    await user.click(await screen.findByRole('button', { name: /add vehicle/i }))
    const dialog = await screen.findByRole('dialog', { name: /add vehicle/i })
    await user.clear(within(dialog).getByLabelText(/initial stock/i))
    await user.type(within(dialog).getByLabelText(/initial stock/i), '-2')
    await user.click(within(dialog).getByRole('button', { name: /create vehicle/i }))

    expect(within(dialog).getByText(/make is required/i)).toBeInTheDocument()
    expect(within(dialog).getByText(/model is required/i)).toBeInTheDocument()
    expect(within(dialog).getByText(/price must be greater than 0/i)).toBeInTheDocument()
    expect(within(dialog).getByText(/stock must be a whole number of 0 or more/i)).toBeInTheDocument()
  })

  it('shows field errors returned by the API', async () => {
    server.use(
      http.post(`${API_URL}/vehicles`, () =>
        HttpResponse.json(
          {
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Request validation failed',
              details: [{ field: 'year', issue: 'year must be between 1900 and 2027' }],
            },
          },
          { status: 422 },
        ),
      ),
    )
    const { user } = renderApp({ path: '/app', user: seedUser('admin') })

    await user.click(await screen.findByRole('button', { name: /add vehicle/i }))
    const dialog = await screen.findByRole('dialog', { name: /add vehicle/i })
    await user.type(within(dialog).getByLabelText(/^make/i), 'Old')
    await user.type(within(dialog).getByLabelText(/^model/i), 'Timer')
    await user.type(within(dialog).getByLabelText(/^price/i), '1000')
    await user.click(within(dialog).getByRole('button', { name: /create vehicle/i }))

    expect(await within(dialog).findByText(/between 1900 and 2027/i)).toBeInTheDocument()
  })
})

describe('admin: manage an existing vehicle', () => {
  it('edits vehicle details', async () => {
    const vehicle = seedVehicle({ make: 'Ford', model: 'Kuga', price: '35990.00' })
    const { user } = renderApp({ path: '/app', user: seedUser('admin') })
    const dialog = await openDetails(user, 'Ford Kuga')

    await user.click(within(dialog).getByRole('tab', { name: /edit/i }))
    const price = within(dialog).getByLabelText(/^price/i)
    await user.clear(price)
    await user.type(price, '33500')
    await user.click(within(dialog).getByRole('button', { name: /save changes/i }))

    expect(await within(dialog).findByText(/changes saved/i)).toBeInTheDocument()
    expect(getVehicle(vehicle.id)?.price).toBe('33500.00')
    const list = screen.getByRole('list', { name: /vehicles/i })
    await waitFor(() => expect(within(list).getByText('$33,500')).toBeInTheDocument())
  })

  it('restocks a vehicle', async () => {
    const vehicle = seedVehicle({ make: 'Renault', model: 'Zoe', quantity: 0 })
    const { user } = renderApp({ path: '/app', user: seedUser('admin') })
    const dialog = await openDetails(user, 'Renault Zoe')

    await user.click(within(dialog).getByRole('tab', { name: /restock/i }))
    await user.type(within(dialog).getByLabelText(/units to add/i), '5')
    await user.click(within(dialog).getByRole('button', { name: /^restock/i }))

    expect(await within(dialog).findByText(/added 5 units/i)).toBeInTheDocument()
    expect(getVehicle(vehicle.id)?.quantity).toBe(5)
  })

  it('rejects an invalid restock amount', async () => {
    seedVehicle({ make: 'Renault', model: 'Zoe', quantity: 0 })
    const { user } = renderApp({ path: '/app', user: seedUser('admin') })
    const dialog = await openDetails(user, 'Renault Zoe')

    await user.click(within(dialog).getByRole('tab', { name: /restock/i }))
    await user.type(within(dialog).getByLabelText(/units to add/i), '0')
    await user.click(within(dialog).getByRole('button', { name: /^restock/i }))

    expect(within(dialog).getByText(/between 1 and 1000/i)).toBeInTheDocument()
  })

  it('deletes a vehicle after confirmation', async () => {
    const vehicle = seedVehicle({ make: 'Ford', model: 'Kuga' })
    seedVehicle({ make: 'Dacia', model: 'Duster' })
    const { user } = renderApp({ path: '/app', user: seedUser('admin') })
    const dialog = await openDetails(user, 'Ford Kuga')

    await user.click(within(dialog).getByRole('button', { name: /delete vehicle/i }))
    const confirm = await screen.findByRole('alertdialog', { name: /delete ford kuga/i })
    await user.click(within(confirm).getByRole('button', { name: /^delete$/i }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(getVehicle(vehicle.id)).toBeUndefined()
    const list = screen.getByRole('list', { name: /vehicles/i })
    await waitFor(() => expect(within(list).queryByText('Ford Kuga')).not.toBeInTheDocument())
  })

  it('keeps the vehicle when deletion is cancelled', async () => {
    const vehicle = seedVehicle({ make: 'Ford', model: 'Kuga' })
    const { user } = renderApp({ path: '/app', user: seedUser('admin') })
    const dialog = await openDetails(user, 'Ford Kuga')

    await user.click(within(dialog).getByRole('button', { name: /delete vehicle/i }))
    const confirm = await screen.findByRole('alertdialog')
    await user.click(within(confirm).getByRole('button', { name: /cancel/i }))

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(getVehicle(vehicle.id)).toBeDefined()
  })
})
