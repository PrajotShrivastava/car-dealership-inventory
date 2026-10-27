import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { getLeads, localDate, seedLead, seedUser, seedVehicle } from '../../test/handlers'
import { renderApp } from '../../test/utils'

async function openDetails(user: ReturnType<typeof renderApp>['user']) {
  const list = await screen.findByRole('list', { name: /vehicles/i })
  const [row] = within(list).getAllByRole('listitem')
  await user.click(within(row).getByRole('button', { name: /view details/i }))
  return screen.findByRole('dialog')
}

describe('customer enquiries', () => {
  it('sends a question that reaches the dealer as a lead', async () => {
    const dealer = seedUser('dealer')
    const vehicle = seedVehicle({ make: 'Kia', model: 'Seltos' }, dealer)
    const { user } = renderApp({ path: '/app', user: seedUser('customer') })
    const dialog = await openDetails(user)

    expect(within(dialog).getByText(/reply to customer@example.com/i)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Ask a question' }))
    const form = within(dialog).getByRole('form', { name: 'Ask a question' })
    await user.type(within(form).getByLabelText('Your question'), 'Any service history?')
    await user.type(within(form).getByLabelText(/phone/i), '+44 7700 900123')
    await user.click(within(form).getByRole('button', { name: 'Send question' }))

    expect(await within(dialog).findByText(/question sent/i)).toBeInTheDocument()
    expect(within(dialog).queryByRole('form')).not.toBeInTheDocument()
    const [lead] = getLeads()
    expect(lead).toMatchObject({
      dealer_id: dealer.id,
      vehicle_id: vehicle.id,
      email: 'customer@example.com',
      phone: '+44 7700 900123',
      source: 'Website enquiry',
      notes: 'Any service history?',
      follow_up_on: localDate(),
    })
  })

  it('requests a test drive on a chosen date', async () => {
    const dealer = seedUser('dealer')
    seedVehicle({}, dealer)
    const { user } = renderApp({ path: '/app', user: seedUser('customer') })
    const dialog = await openDetails(user)

    await user.click(within(dialog).getByRole('button', { name: 'Book a test drive' }))
    const form = within(dialog).getByRole('form', { name: 'Book a test drive' })
    await user.type(within(form).getByLabelText('Preferred date'), '2099-03-14')
    await user.click(within(form).getByRole('button', { name: 'Request test drive' }))

    expect(await within(dialog).findByText(/will confirm mar 14, 2099/i)).toBeInTheDocument()
    expect(getLeads()[0]).toMatchObject({ source: 'Test drive request', notes: 'Preferred test drive date: 2099-03-14' })
  })

  it('checks the form before sending', async () => {
    seedVehicle({}, seedUser('dealer'))
    const { user } = renderApp({ path: '/app', user: seedUser('customer') })
    const dialog = await openDetails(user)

    await user.click(within(dialog).getByRole('button', { name: 'Ask a question' }))
    await user.click(within(dialog).getByRole('button', { name: 'Send question' }))
    expect(within(dialog).getByText('Write your question')).toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: 'Book a test drive' }))
    await user.click(within(dialog).getByRole('button', { name: 'Request test drive' }))
    expect(within(dialog).getByText('Choose a date')).toBeInTheDocument()
    expect(getLeads()).toHaveLength(0)
  })

  it('explains when the customer has already asked', async () => {
    const dealer = seedUser('dealer')
    const customer = seedUser('customer')
    const vehicle = seedVehicle({}, dealer)
    seedLead(dealer, { vehicle_id: vehicle.id, customer_id: customer.id, enquiry_kind: 'question' })
    const { user } = renderApp({ path: '/app', user: customer })
    const dialog = await openDetails(user)

    await user.click(within(dialog).getByRole('button', { name: 'Ask a question' }))
    await user.type(within(dialog).getByLabelText('Your question'), 'Still available?')
    await user.click(within(dialog).getByRole('button', { name: 'Send question' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/already sent a question/i)
  })

  it('is not offered for a vehicle no dealer listed', async () => {
    seedVehicle()
    const { user } = renderApp({ path: '/app', user: seedUser('customer') })
    const dialog = await openDetails(user)

    expect(within(dialog).queryByRole('button', { name: 'Ask a question' })).not.toBeInTheDocument()
  })

  it.each(['dealer', 'admin'] as const)('is not offered to a %s', async (role) => {
    const viewer = seedUser(role)
    seedVehicle({}, role === 'dealer' ? viewer : seedUser('dealer'))
    const { user } = renderApp({ path: '/app/inventory', user: viewer })
    const dialog = await openDetails(user)

    expect(within(dialog).queryByRole('button', { name: 'Ask a question' })).not.toBeInTheDocument()
  })
})
