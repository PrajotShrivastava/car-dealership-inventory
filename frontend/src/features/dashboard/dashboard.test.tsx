import { screen, waitFor, within } from '@testing-library/react'
import { delay, http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { API_URL } from '../../api/client'
import type { Dashboard, DashboardRange, DashboardVehicle } from '../../api/types'
import { dashboardRequests, emptyDashboard, lastMonths, seedUser, setDashboard } from '../../test/handlers'
import { server } from '../../test/server'
import { renderApp } from '../../test/utils'

function car(overrides: Partial<DashboardVehicle> = {}): DashboardVehicle {
  return {
    id: 41,
    make: 'Ford',
    model: 'Kuga',
    trim: 'ST-Line',
    year: 2024,
    category: 'suv',
    price: '25000.00',
    quantity: 4,
    units_sold: 0,
    revenue: '0.00',
    photo: null,
    created_at: '2026-10-02T10:00:00Z',
    ...overrides,
  }
}

const kuga = car({ id: 41, units_sold: 5, revenue: '125000.00', quantity: 1 })
const tesla = car({ id: 42, make: 'Tesla', model: 'Model 3', trim: null, price: '42990.00', units_sold: 2, revenue: '85980.00', quantity: 0 })
const kia = car({ id: 43, make: 'Kia', model: 'Sportage', trim: null, price: '29990.00', quantity: 6, created_at: '2026-10-20T09:00:00Z' })

function busy(months: DashboardRange = 6): Dashboard {
  // Newest first: 3 units this month, 2 last month (matching the summary), then older months.
  const units = [3, 2, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0].slice(0, months).reverse()
  return {
    ...emptyDashboard(months),
    summary: {
      total_listings: 3,
      available_stock: 7,
      in_stock: 1,
      low_stock: 1,
      out_of_stock: 1,
      never_sold: 1,
      low_stock_threshold: 2,
      inventory_value: '204940.00',
      units_sold: 7,
      sales_count: 5,
      total_revenue: '210980.00',
      gross_profit: '31000.00',
      sales_with_cost: 3,
      units_sold_this_month: 3,
      revenue_this_month: '75000.00',
      units_sold_last_month: 2,
      revenue_last_month: '50000.00',
      has_sales_before_this_month: true,
    },
    monthly: lastMonths(months).map((month, i) => ({
      month,
      units: units[i]!,
      revenue: (units[i]! * 25000).toFixed(2),
    })),
    best_seller: { label: '2024 Ford Kuga ST-Line', units_sold: 5, revenue: '125000.00', vehicle: kuga },
    top_revenue: { label: '2024 Ford Kuga ST-Line', units_sold: 5, revenue: '125000.00', vehicle: kuga },
    top_sellers: [
      { label: '2024 Ford Kuga ST-Line', units_sold: 5, revenue: '125000.00', vehicle: kuga },
      { label: '2024 Tesla Model 3', units_sold: 2, revenue: '85980.00', vehicle: tesla },
    ],
    low_stock: [kuga],
    out_of_stock: [tesla],
    never_sold: [kia],
    recent_listings: [kia, kuga],
    recent_sales: [
      { id: 908, channel: 'dealer', customer_name: 'Priya Shah', created_at: '2026-10-21T15:30:00Z', vehicle_id: 41, vehicle_label: '2024 Ford Kuga ST-Line', quantity: 3, unit_price: '25000.00', total_price: '75000.00' },
      { id: 907, channel: 'online', customer_name: 'Sam Buyer', created_at: '2026-09-12T11:00:00Z', vehicle_id: null, vehicle_label: '2023 Renault Zoe', quantity: 1, unit_price: '24990.00', total_price: '24990.00' },
    ],
    follow_ups: {
      overdue: 1,
      today: 0,
      upcoming: 1,
      items: [
        { id: 61, name: 'Old Ollie', status: 'contacted', follow_up_on: '2026-10-10', vehicle_label: '2024 Ford Kuga ST-Line' },
        { id: 62, name: 'Soon Sam', status: 'new', follow_up_on: '2099-01-01', vehicle_label: null },
      ],
    },
  }
}

function renderDashboard() {
  return renderApp({ path: '/app/dashboard', user: seedUser('dealer') })
}

const kpi = (name: string) => within(screen.getByRole('region', { name: 'Key figures' })).getByRole('group', { name })

describe('dealer dashboard', () => {
  it('shows a loading skeleton, then the figures', async () => {
    server.use(
      http.get(`${API_URL}/dashboard`, async () => {
        await delay(50)
        return HttpResponse.json(busy())
      }),
    )
    renderDashboard()

    expect(await screen.findByRole('status', { name: /loading dashboard/i })).toBeInTheDocument()
    expect(await screen.findByRole('group', { name: 'Units sold' })).toBeInTheDocument()
    expect(screen.queryByRole('status', { name: /loading dashboard/i })).not.toBeInTheDocument()
  })

  it('shows an error with a retry', async () => {
    let calls = 0
    server.use(
      http.get(`${API_URL}/dashboard`, () =>
        ++calls === 1
          ? HttpResponse.json({ error: { code: 'HTTP_ERROR', message: 'Database unavailable' } }, { status: 503 })
          : HttpResponse.json(busy()),
      ),
    )
    const { user } = renderDashboard()

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/couldn.t load your dashboard/i)
    expect(alert).toHaveTextContent('Database unavailable')
    await user.click(within(alert).getByRole('button', { name: /try again/i }))
    expect(await screen.findByRole('group', { name: 'Units sold' })).toBeInTheDocument()
  })

  it('sends the viewer time zone and the default six-month range', async () => {
    renderDashboard()

    await screen.findByRole('group', { name: 'Units sold' })
    const params = dashboardRequests.at(-1)!
    expect(params.get('months')).toBe('6')
    expect(params.get('tz')).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone)
  })

  describe('with no listings or sales', () => {
    it('shows zeros without trends and invites the first listing', async () => {
      const { user, router } = renderDashboard()

      expect(within(await screen.findByRole('group', { name: 'Total listings' })).getByText('0')).toBeInTheDocument()
      expect(within(kpi('Total sales revenue')).getByText('$0')).toBeInTheDocument()
      expect(within(kpi('Gross profit')).getByText('—')).toBeInTheDocument()
      expect(within(screen.getByRole('region', { name: 'Follow-ups' })).getByText(/no follow-ups due/i)).toBeInTheDocument()
      expect(screen.queryByText(/last month/i)).not.toBeInTheDocument()
      expect(screen.queryByText(/%/)).not.toBeInTheDocument()

      const chart = screen.getByRole('region', { name: 'Sales overview' })
      expect(within(chart).getByText('No sales yet')).toBeInTheDocument()
      const insights = screen.getByRole('region', { name: 'Performance insights' })
      expect(within(insights).getAllByText('Not enough sales data yet').length).toBeGreaterThan(0)
      expect(within(screen.getByRole('region', { name: 'Recent sales' })).getByText(/no sales recorded yet/i)).toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: 'Add your first vehicle' }))
      await waitFor(() => expect(router.state.location.pathname).toBe('/app/inventory'))
      expect(await screen.findByRole('dialog', { name: /add vehicle/i })).toBeInTheDocument()
    })
  })

  describe('with sales', () => {
    it('shows the eight headline figures', async () => {
      setDashboard(busy())
      renderDashboard()

      await screen.findByRole('group', { name: 'Units sold' })
      expect(within(kpi('Total listings')).getByText('3')).toBeInTheDocument()
      expect(within(kpi('Units sold')).getByText('7')).toBeInTheDocument()
      expect(within(kpi('Available stock')).getByText('7')).toBeInTheDocument()
      expect(within(kpi('Out of stock')).getByText('1')).toBeInTheDocument()
      expect(within(kpi('Total sales revenue')).getByText('$210,980')).toBeInTheDocument()
      expect(within(kpi('Sales this month')).getByText('3')).toBeInTheDocument()
      expect(within(kpi('Revenue this month')).getByText('$75,000')).toBeInTheDocument()
      expect(within(kpi('Inventory value')).getByText('$204,940')).toBeInTheDocument()
      expect(within(kpi('Completed sales')).getByText('5')).toBeInTheDocument()
      expect(within(kpi('Gross profit')).getByText('$31,000')).toBeInTheDocument()
      expect(kpi('Gross profit')).toHaveTextContent('From 3 of 5 sales with a recorded cost')
    })

    it('shows follow-ups due and links to sales and leads', async () => {
      setDashboard(busy())
      renderDashboard()

      const followUps = await screen.findByRole('region', { name: 'Follow-ups' })
      expect(followUps).toHaveTextContent('1 overdue')
      expect(within(followUps).getByRole('link', { name: /old ollie/i })).toHaveAttribute('href', '/app/leads?lead=61')
      expect(within(followUps).getByRole('link', { name: /old ollie/i })).toHaveTextContent('Overdue')
      expect(screen.getByRole('link', { name: 'View all sales' })).toHaveAttribute('href', '/app/sales')
    })

    it('compares this month with last month only when there is history', async () => {
      setDashboard(busy())
      renderDashboard()

      await screen.findByRole('group', { name: 'Units sold' })
      expect(within(kpi('Sales this month')).getByText('+50% vs last month')).toBeInTheDocument()
      expect(within(kpi('Revenue this month')).getByText('+50% vs last month')).toBeInTheDocument()
    })

    it('states last month plainly instead of a percentage when it had no sales', async () => {
      const data = busy()
      data.summary = { ...data.summary, units_sold_last_month: 0, revenue_last_month: '0.00' }
      setDashboard(data)
      renderDashboard()

      await screen.findByRole('group', { name: 'Units sold' })
      expect(within(kpi('Sales this month')).getByText('None last month')).toBeInTheDocument()
      expect(screen.queryByText(/%/)).not.toBeInTheDocument()
    })

    it('charts monthly units, switches to revenue, and explains each month on hover', async () => {
      setDashboard(busy())
      const { user } = renderDashboard()

      const chart = await screen.findByRole('region', { name: 'Sales overview' })
      const table = within(chart).getByRole('table', { name: /monthly sales/i })
      expect(within(table).getAllByRole('row')).toHaveLength(1 + 6)
      expect(within(table).getByRole('rowheader', { name: 'Oct 2026' }).closest('tr')).toHaveTextContent('Oct 20263$75,000')

      await user.click(within(chart).getByRole('button', { name: 'Revenue' }))
      expect(within(chart).getByRole('button', { name: 'Revenue' })).toHaveAttribute('aria-pressed', 'true')

      await user.hover(within(chart).getByTestId('bar-2026-10'))
      expect(await within(chart).findByRole('tooltip')).toHaveTextContent(/oct 2026.*3 units.*\$75,000/i)
    })

    it('changes the time range', async () => {
      setDashboard(busy)
      const { user } = renderDashboard()

      const chart = await screen.findByRole('region', { name: 'Sales overview' })
      await user.selectOptions(within(chart).getByLabelText('Time range'), '12')

      await waitFor(() => expect(dashboardRequests.at(-1)!.get('months')).toBe('12'))
      await waitFor(() =>
        expect(within(within(chart).getByRole('table', { name: /monthly sales/i })).getAllByRole('row')).toHaveLength(13),
      )
    })

    it('summarises stock levels and lists vehicles with stock and sales', async () => {
      setDashboard(busy())
      const { user } = renderDashboard()

      const overview = await screen.findByRole('region', { name: 'Inventory overview' })
      expect(within(within(overview).getByRole('group', { name: 'In stock' })).getByText('1')).toBeInTheDocument()
      expect(within(within(overview).getByRole('group', { name: /low stock/i })).getByText('1')).toBeInTheDocument()
      expect(within(within(overview).getByRole('group', { name: 'Out of stock' })).getByText('1')).toBeInTheDocument()

      const lowRow = within(overview).getByRole('link', { name: /ford kuga/i })
      expect(lowRow).toHaveTextContent('1 left')
      expect(lowRow).toHaveTextContent('5 sold')
      expect(lowRow).toHaveAttribute('href', '/app/inventory?vehicle=41')

      await user.click(within(overview).getByRole('tab', { name: 'Never sold' }))
      expect(within(overview).getByRole('link', { name: /kia sportage/i })).toHaveTextContent('0 sold')
      await user.click(within(overview).getByRole('tab', { name: 'Top sellers' }))
      expect(within(overview).getAllByRole('link', { name: /ford kuga|tesla model 3/i })).toHaveLength(2)
      await user.click(within(overview).getByRole('tab', { name: 'Recently added' }))
      expect(within(overview).getAllByRole('link')[0]).toHaveTextContent(/kia sportage/i)
    })

    it('offers shortcuts to manage the inventory', async () => {
      setDashboard(busy())
      renderDashboard()

      await screen.findByRole('region', { name: 'Inventory overview' })
      expect(screen.getByRole('link', { name: 'View all inventory' })).toHaveAttribute('href', '/app/inventory')
      expect(screen.getByRole('link', { name: 'Manage stock' })).toHaveAttribute(
        'href',
        '/app/inventory?availability=out_of_stock',
      )
      expect(screen.getByRole('button', { name: 'Add vehicle' })).toBeInTheDocument()
    })

    it('lists recent sales with date, vehicle, quantity, total and reference', async () => {
      setDashboard(busy())
      renderDashboard()

      const sales = await screen.findByRole('region', { name: 'Recent sales' })
      const rows = within(sales).getAllByRole('row').slice(1)
      expect(rows).toHaveLength(2)
      expect(rows[0]).toHaveTextContent(/2024 Ford Kuga ST-Line/)
      expect(rows[0]).toHaveTextContent('3')
      expect(rows[0]).toHaveTextContent('$75,000')
      expect(rows[0]).toHaveTextContent('#908')
      expect(rows[1]).toHaveTextContent(/removed from inventory/i)
    })

    it('shows recent activity from listings and sales, newest first', async () => {
      setDashboard(busy())
      renderDashboard()

      const activity = await screen.findByRole('region', { name: 'Recent activity' })
      const items = within(activity).getAllByRole('listitem')
      expect(items[0]).toHaveTextContent(/sold 3 × 2024 Ford Kuga ST-Line/i)
      expect(items[1]).toHaveTextContent(/listed 2024 Kia Sportage/i)
    })

    it('gives insights drawn from the data', async () => {
      setDashboard(busy())
      renderDashboard()

      const insights = await screen.findByRole('region', { name: 'Performance insights' })
      expect(within(within(insights).getByRole('group', { name: 'Best-selling vehicle' })).getByText(/ford kuga/i)).toBeInTheDocument()
      expect(within(within(insights).getByRole('group', { name: 'Highest revenue' })).getByText('$125,000')).toBeInTheDocument()
      expect(within(within(insights).getByRole('group', { name: 'Stock to watch' })).getByText(/2 listings/i)).toBeInTheDocument()
      expect(within(within(insights).getByRole('group', { name: 'Unsold listings' })).getByText(/1 listing/i)).toBeInTheDocument()
      expect(within(within(insights).getByRole('group', { name: 'Sales trend' })).getByText(/up 50%/i)).toBeInTheDocument()
    })
  })
})
