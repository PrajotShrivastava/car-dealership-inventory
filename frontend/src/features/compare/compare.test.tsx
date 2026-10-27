import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { seedUser, seedVehicle } from '../../test/handlers'
import { renderApp } from '../../test/utils'
import { compareStore, parseIds } from './compareStore'

function cells(table: HTMLElement, label: string) {
  const row = within(table).getByRole('rowheader', { name: label }).closest('tr')!
  return within(row)
    .getAllByRole('cell')
    .map((cell) => cell.textContent)
}

describe('comparing vehicles', () => {
  it('picks vehicles from the inventory and compares them side by side', async () => {
    seedVehicle({ make: 'Kia', model: 'Seltos', price: '24000.00', year: 2023, condition: 'used', mileage: 30_000 })
    seedVehicle({ make: 'Ford', model: 'Puma', price: '26000.00', year: 2025, condition: 'used', mileage: 8_000 })
    seedVehicle({ make: 'Mazda', model: 'CX-30', price: '28000.00', year: 2024 })
    const { user } = renderApp({ path: '/app/inventory', user: seedUser('customer') })
    await screen.findByRole('list', { name: /vehicles/i })

    await user.click(screen.getByRole('button', { name: 'Compare Kia Seltos' }))
    const bar = screen.getByRole('region', { name: 'Comparison' })
    expect(bar).toHaveTextContent('Pick one more to compare')
    expect(within(bar).queryByRole('link', { name: 'Compare' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Compare Ford Puma' }))
    expect(screen.getByRole('button', { name: 'Compare Ford Puma' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(within(bar).getByRole('link', { name: 'Compare' }))

    const table = await screen.findByRole('table', { name: 'Vehicle comparison' })
    const headers = within(table).getAllByRole('columnheader')
    expect(headers[1]).toHaveTextContent('Kia Seltos')
    expect(headers[2]).toHaveTextContent('Ford Puma')
    expect(cells(table, 'Price')).toEqual(['$24,000Lowest price', '$26,000'])
    expect(cells(table, 'Mileage')).toEqual(['30,000 mi', '8,000 miLowest mileage'])
    expect(cells(table, 'Year')).toEqual(['2023', '2025Newest'])
  })

  it('allows at most three vehicles', async () => {
    for (const model of ['A', 'B', 'C', 'D']) seedVehicle({ model })
    const { user } = renderApp({ path: '/app/inventory', user: seedUser('customer') })
    await screen.findByRole('list', { name: /vehicles/i })

    for (const model of ['A', 'B', 'C']) await user.click(screen.getByRole('button', { name: `Compare Ford ${model}` }))

    expect(screen.getByRole('button', { name: 'Compare Ford D' })).toBeDisabled()
    expect(screen.getByRole('region', { name: 'Comparison' })).toHaveTextContent('3 of 3')
  })

  it('lists every feature and which vehicles have it', async () => {
    const a = seedVehicle({ model: 'A', features: ['Sunroof', 'Heated seats'] })
    const b = seedVehicle({ model: 'B', features: ['heated seats', 'Apple CarPlay'] })
    renderApp({ path: `/app/compare?ids=${a.id},${b.id}`, user: seedUser('customer') })

    const table = await screen.findByRole('table', { name: 'Vehicle comparison' })
    await within(table).findByRole('rowheader', { name: 'Sunroof' })
    const marks = (label: string) =>
      within(within(table).getByRole('rowheader', { name: label }).closest('tr')!)
        .getAllByRole('img')
        .map((icon) => icon.getAttribute('aria-label'))
    expect(marks('Sunroof')).toEqual(['Included', 'Not listed'])
    expect(marks('Heated seats')).toEqual(['Included', 'Included'])
    expect(marks('Apple CarPlay')).toEqual(['Not listed', 'Included'])
  })

  it('marks nothing as best when the values are the same', async () => {
    const a = seedVehicle({ model: 'A', price: '20000.00', year: 2024 })
    const b = seedVehicle({ model: 'B', price: '20000.00', year: 2024 })
    renderApp({ path: `/app/compare?ids=${a.id},${b.id}`, user: seedUser('customer') })

    const table = await screen.findByRole('table', { name: 'Vehicle comparison' })
    await waitFor(() => expect(cells(table, 'Price')).toEqual(['$20,000', '$20,000']))
    expect(within(table).queryByText(/lowest|newest/i)).not.toBeInTheDocument()
  })

  it('removes a vehicle from the comparison', async () => {
    const a = seedVehicle({ model: 'A' })
    const b = seedVehicle({ model: 'B' })
    const c = seedVehicle({ model: 'C' })
    const { user } = renderApp({ path: `/app/compare?ids=${a.id},${b.id},${c.id}`, user: seedUser('customer') })
    const table = await screen.findByRole('table', { name: 'Vehicle comparison' })
    await within(table).findByText('Ford B')

    await user.click(within(table).getByRole('button', { name: 'Remove Ford B from comparison' }))

    await waitFor(() => expect(within(table).queryByText('Ford B')).not.toBeInTheDocument())
    expect(within(table).getAllByRole('columnheader')).toHaveLength(3)
  })

  it('shows a vehicle that has gone as no longer available', async () => {
    const a = seedVehicle({ model: 'A' })
    renderApp({ path: `/app/compare?ids=${a.id},999`, user: seedUser('customer') })

    const table = await screen.findByRole('table', { name: 'Vehicle comparison' })
    expect(await within(table).findByText('No longer available')).toBeInTheDocument()
  })

  it('asks for at least two vehicles', async () => {
    const a = seedVehicle({ model: 'A' })
    renderApp({ path: `/app/compare?ids=${a.id}`, user: seedUser('customer') })

    expect(await screen.findByRole('heading', { name: 'Pick at least two vehicles to compare' })).toBeInTheDocument()
  })

  it('remembers the picked vehicles across a reload', async () => {
    seedVehicle({ model: 'A' })
    const customer = seedUser('customer')
    const first = renderApp({ path: '/app/inventory', user: customer })
    await screen.findByRole('list', { name: /vehicles/i })
    await first.user.click(screen.getByRole('button', { name: 'Compare Ford A' }))
    first.unmount()
    compareStore.reload() // a fresh page load reads the selection back from storage

    renderApp({ path: '/app/inventory', user: customer })

    const bar = await screen.findByRole('region', { name: 'Comparison' })
    await waitFor(() => expect(bar).toHaveTextContent('Ford A'))
  })

  it.each(['dealer', 'admin'] as const)('is not offered to a %s', async (role) => {
    const viewer = seedUser(role)
    seedVehicle({}, role === 'dealer' ? viewer : undefined)
    renderApp({ path: '/app/inventory', user: viewer })
    await screen.findByRole('list', { name: /vehicles/i })

    expect(screen.queryByRole('button', { name: /^compare/i })).not.toBeInTheDocument()
  })

  it('reads ids from the link safely', () => {
    expect(parseIds('4,9,4,x,-1,0,12,15')).toEqual([4, 9, 12])
    expect(parseIds(null)).toEqual([])
  })
})
