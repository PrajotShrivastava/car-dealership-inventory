import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { User } from '../../api/types'
import { getLead, getVehicle, localDate, seedLead, seedUser, seedVehicle } from '../../test/handlers'
import { renderApp } from '../../test/utils'

function asDealer(path = '/app/leads', dealer: User = seedUser('dealer')) {
  return { dealer, ...renderApp({ path, user: dealer }) }
}

const table = () => screen.getByRole('table', { name: 'Leads' })
const rows = () => within(table()).getAllByRole('row').slice(1)
const names = () => rows().map((row) => within(row).getAllByRole('cell')[0]!.textContent)

describe('leads list', () => {
  it('shows each lead with status, follow-up and overdue marker', async () => {
    const dealer = seedUser('dealer')
    seedLead(dealer, { name: 'Old Ollie', follow_up_on: localDate(-2), status: 'contacted' })
    seedLead(dealer, { name: 'Today Tara', follow_up_on: localDate(0) })
    seedLead(dealer, { name: 'No Date Noor', email: 'noor@example.com' })
    asDealer('/app/leads', dealer)

    await screen.findByRole('table', { name: 'Leads' })
    expect(names()).toEqual([
      expect.stringContaining('Old Ollie'),
      expect.stringContaining('Today Tara'),
      expect.stringContaining('No Date Noor'),
    ])
    expect(rows()[0]).toHaveTextContent('Contacted')
    expect(rows()[0]).toHaveTextContent('Overdue')
    expect(rows()[1]).toHaveTextContent('Today')
    expect(rows()[2]).toHaveTextContent('noor@example.com')
  })

  it('filters by reminders, search and status', async () => {
    const dealer = seedUser('dealer')
    seedLead(dealer, { name: 'Old Ollie', follow_up_on: localDate(-2) })
    seedLead(dealer, { name: 'Soon Sam', follow_up_on: localDate(3) })
    seedLead(dealer, { name: 'Lost Lou', follow_up_on: localDate(-5), status: 'lost' })
    const { user } = asDealer('/app/leads', dealer)

    const overdue = await screen.findByRole('button', { name: /overdue 1/i })
    expect(screen.getByRole('button', { name: /next 7 days 1/i })).toBeInTheDocument()
    await user.click(overdue)
    expect(overdue).toHaveAttribute('aria-pressed', 'true')
    await waitFor(() => expect(names()).toEqual([expect.stringContaining('Old Ollie')]))
    await user.click(overdue)

    await user.type(screen.getByRole('searchbox', { name: 'Search leads' }), 'sam')
    await waitFor(() => expect(names()).toEqual([expect.stringContaining('Soon Sam')]))
    await user.clear(screen.getByRole('searchbox', { name: 'Search leads' }))

    await user.selectOptions(screen.getByLabelText('Status'), 'lost')
    await waitFor(() => expect(names()).toEqual([expect.stringContaining('Lost Lou')]))
  })

  it('shows an empty state with a way to add the first lead', async () => {
    asDealer()

    expect(await screen.findByText('No leads yet')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'New lead' }).length).toBeGreaterThan(0)
  })

  it('keeps leads out of reach of customers', async () => {
    const { router } = renderApp({ path: '/app/leads', user: seedUser('customer') })

    await waitFor(() => expect(router.state.location.pathname).toBe('/app/inventory'))
  })
})

describe('creating and editing leads', () => {
  it('creates a lead with an interested vehicle and follow-up', async () => {
    const dealer = seedUser('dealer')
    const kuga = seedVehicle({ make: 'Ford', model: 'Kuga' }, dealer)
    const { user } = asDealer('/app/leads', dealer)

    await user.click((await screen.findAllByRole('button', { name: 'New lead' }))[0]!)
    const form = await screen.findByRole('dialog', { name: 'New lead' })
    await user.type(within(form).getByLabelText('Name'), 'Arjun Mehta')
    await user.type(within(form).getByLabelText('Phone (optional)'), '+91 99887 76655')
    await user.selectOptions(within(form).getByLabelText('Interested vehicle (optional)'), String(kuga.id))
    await user.type(within(form).getByLabelText('Budget (optional, USD)'), '25000')
    await user.type(within(form).getByLabelText('Source (optional)'), 'Walk-in')
    await user.type(within(form).getByLabelText('Notes (optional)'), 'Wants a Saturday test drive.')
    await user.type(within(form).getByLabelText('Next follow-up (optional)'), localDate(2))
    await user.click(within(form).getByRole('button', { name: 'Create lead' }))

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'New lead' })).not.toBeInTheDocument())
    expect(await screen.findByRole('table', { name: 'Leads' })).toHaveTextContent('Arjun Mehta')
    expect(table()).toHaveTextContent('Ford Kuga')
    expect(table()).toHaveTextContent('$25,000')
  })

  it('requires a name and checks the email and phone', async () => {
    const { user } = asDealer()

    await user.click((await screen.findAllByRole('button', { name: 'New lead' }))[0]!)
    const form = await screen.findByRole('dialog', { name: 'New lead' })
    await user.type(within(form).getByLabelText('Email (optional)'), 'nope')
    await user.type(within(form).getByLabelText('Phone (optional)'), 'ring')
    await user.click(within(form).getByRole('button', { name: 'Create lead' }))

    expect(within(form).getByText('Name is required')).toBeInTheDocument()
    expect(within(form).getByText('Enter a valid email address')).toBeInTheDocument()
    expect(within(form).getByText('Enter a valid phone number')).toBeInTheDocument()
  })

  it('edits a lead’s details', async () => {
    const dealer = seedUser('dealer')
    const lead = seedLead(dealer, { name: 'Arjun Mehta', notes: 'first' })
    const { user } = asDealer(`/app/leads?lead=${lead.id}`, dealer)

    const details = await screen.findByRole('dialog', { name: 'Arjun Mehta' })
    await user.click(within(details).getByRole('button', { name: 'Edit details' }))
    const form = await screen.findByRole('dialog', { name: 'Edit lead' })
    await user.clear(within(form).getByLabelText('Notes (optional)'))
    await user.type(within(form).getByLabelText('Notes (optional)'), 'second')
    await user.click(within(form).getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(getLead(lead.id)!.notes).toBe('second'))
  })
})

describe('quick actions and history', () => {
  it('changes status straight from the table', async () => {
    const dealer = seedUser('dealer')
    const lead = seedLead(dealer, { name: 'Arjun Mehta' })
    const { user } = asDealer('/app/leads', dealer)

    await screen.findByRole('table', { name: 'Leads' })
    await user.selectOptions(screen.getByRole('combobox', { name: 'Status for Arjun Mehta' }), 'contacted')

    await waitFor(() => expect(getLead(lead.id)!.status).toBe('contacted'))
  })

  it('schedules the next follow-up and shows the history', async () => {
    const dealer = seedUser('dealer')
    const lead = seedLead(dealer, { name: 'Arjun Mehta' })
    const { user } = asDealer(`/app/leads?lead=${lead.id}`, dealer)

    const details = await screen.findByRole('dialog', { name: 'Arjun Mehta' })
    await user.click(within(details).getByRole('button', { name: 'Tomorrow' }))
    await waitFor(() => expect(getLead(lead.id)!.follow_up_on).toBe(localDate(1)))
    await user.selectOptions(within(details).getByLabelText('Status'), 'test_drive_scheduled')
    await waitFor(() => expect(getLead(lead.id)!.status).toBe('test_drive_scheduled'))

    const historyList = within(details).getByRole('list', { name: 'History' })
    await waitFor(() => expect(within(historyList).getAllByRole('listitem')).toHaveLength(3))
    expect(historyList).toHaveTextContent(/status changed from new to test drive scheduled/i)
    expect(historyList).toHaveTextContent(/follow-up set for/i)
    expect(historyList).toHaveTextContent(/lead created/i)
  })

  it('links a converted lead to its sale and keeps it converted', async () => {
    const dealer = seedUser('dealer')
    const lead = seedLead(dealer, { name: 'Arjun Mehta', status: 'converted', sale_id: 321 })
    asDealer(`/app/leads?lead=${lead.id}`, dealer)

    const details = await screen.findByRole('dialog', { name: 'Arjun Mehta' })
    expect(within(details).getByRole('link', { name: 'View sale #321' })).toHaveAttribute('href', '/app/sales?sale=321')
    expect(within(details).getByLabelText('Status')).toBeDisabled()
    expect(within(details).queryByRole('button', { name: 'Record sale' })).not.toBeInTheDocument()
  })

  it('marking a lead converted by hand sells nothing', async () => {
    const dealer = seedUser('dealer')
    const kuga = seedVehicle({ quantity: 2 }, dealer)
    const lead = seedLead(dealer, { name: 'Arjun Mehta', vehicle_id: kuga.id })
    const { user } = asDealer('/app/leads', dealer)

    await screen.findByRole('table', { name: 'Leads' })
    await user.selectOptions(screen.getByRole('combobox', { name: 'Status for Arjun Mehta' }), 'converted')

    await waitFor(() => expect(getLead(lead.id)!.status).toBe('converted'))
    expect(getVehicle(kuga.id)!.quantity).toBe(2)
  })
})
