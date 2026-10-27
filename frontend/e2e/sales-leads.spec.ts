import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'

const PASSWORD = 'dealer-pass-1'
const API = 'http://localhost:8001/api'

async function signUpDealer(page: Page, name: string, email: string) {
  await page.goto('/dealer/register')
  await page.getByLabel('Full name').fill(name)
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create dealer account' }).click()
  await expect(page).toHaveURL(/\/app\/dashboard$/)
}

const nav = (page: Page) => page.getByRole('navigation', { name: 'Main' }).first()
const today = () => new Date().toLocaleDateString('en-CA')

test('a dealer turns a lead into a sale with profit and an invoice, privately', async ({ page, request }) => {
  const stamp = Date.now()
  const email = `sales-dealer-${stamp}@motors.example`
  await signUpDealer(page, 'Sales Dealer', email)

  // 1. A vehicle with an acquisition cost.
  await nav(page).getByRole('link', { name: 'Vehicles' }).click()
  await page.getByRole('button', { name: 'Add vehicle' }).click()
  const add = page.getByRole('dialog', { name: 'Add vehicle' })
  await add.getByLabel('Make').fill('Skoda')
  await add.getByLabel('Model').fill('Kodiaq')
  await add.getByLabel('Price (USD)').fill('30000')
  await add.getByLabel('Acquisition cost (optional)').fill('24000')
  await add.getByLabel('Initial stock').fill('3')
  await add.getByRole('button', { name: 'Create vehicle' }).click()
  await expect(page.getByRole('list', { name: 'Vehicles' })).toContainText('Skoda Kodiaq')

  // 2. A lead interested in it, due for a follow-up today.
  await nav(page).getByRole('link', { name: 'Leads' }).click()
  await page.getByRole('button', { name: 'New lead' }).first().click()
  const form = page.getByRole('dialog', { name: 'New lead' })
  await form.getByLabel('Name').fill('Arjun Mehta')
  await form.getByLabel('Email (optional)').fill('arjun@example.com')
  await form.getByLabel('Interested vehicle (optional)').selectOption({ label: `Skoda Kodiaq (${new Date().getFullYear()})` })
  await form.getByLabel('Next follow-up (optional)').fill(today())
  await form.getByRole('button', { name: 'Create lead' }).click()
  await expect(page.getByRole('button', { name: 'Due today 1' })).toBeVisible()
  const details = page.getByRole('dialog', { name: 'Arjun Mehta' })
  await details.getByLabel('Status').selectOption('negotiation')
  await expect(details.getByRole('list', { name: 'History' })).toContainText('Status changed from new to negotiation')

  // 3. Record the sale from the lead, at an agreed price, after confirming.
  await details.getByRole('button', { name: 'Record sale' }).click()
  await expect(page).toHaveURL(/\/app\/sales$/)
  const sale = page.getByRole('dialog', { name: 'Record sale' })
  await expect(sale.getByLabel('Customer name')).toHaveValue('Arjun Mehta')
  const price = sale.getByLabel('Selling price per unit (USD)')
  await price.clear()
  await price.fill('31000')
  await expect(price).toHaveValue('31000')
  await expect(sale).toContainText('$7,000')
  await sale.getByRole('button', { name: 'Review sale' }).click()
  await page.getByRole('alertdialog', { name: 'Complete this sale?' }).getByRole('button', { name: 'Complete sale' }).click()
  await expect(page.getByText(/Sale #\d+ recorded/)).toBeVisible()

  const history = page.getByRole('table', { name: 'Sales history' })
  await expect(history.getByRole('row')).toHaveCount(2)
  await expect(history.getByRole('row').nth(1)).toContainText('Arjun Mehta')
  await expect(history.getByRole('row').nth(1)).toContainText('$31,000')
  await expect(history.getByRole('row').nth(1)).toContainText('$7,000')
  await expect(page.getByRole('region', { name: 'Sales summary' }).getByRole('group', { name: 'Gross profit' })).toContainText('$7,000')

  // 4. The invoice downloads as a real PDF.
  await history.getByRole('button', { name: /View sale #/ }).click()
  const drawer = page.getByRole('dialog', { name: /Sale #\d+/ })
  const [download] = await Promise.all([page.waitForEvent('download'), drawer.getByRole('button', { name: 'Download invoice' }).click()])
  expect(download.suggestedFilename()).toMatch(/^invoice-\d+\.pdf$/)
  expect(readFileSync(await download.path()).subarray(0, 4).toString()).toBe('%PDF')
  await drawer.getByRole('button', { name: 'Close details' }).click()

  // 5. The lead converted; stock and the dashboard follow the sale.
  await nav(page).getByRole('link', { name: 'Leads' }).click()
  await expect(page.getByRole('table', { name: 'Leads' })).toContainText('Converted')
  await nav(page).getByRole('link', { name: 'Dashboard' }).click()
  const figures = page.getByRole('region', { name: 'Key figures' })
  await expect(figures.getByRole('group', { name: 'Completed sales' })).toContainText('1')
  await expect(figures.getByRole('group', { name: 'Gross profit' })).toContainText('$7,000')
  await expect(figures.getByRole('group', { name: 'Available stock' })).toContainText('2')
  const saleId = (await page.getByRole('region', { name: 'Recent sales' }).getByText(/^#\d+$/).first().textContent())!.slice(1)

  // 6. Another dealer sees none of it, even by asking the API for the id.
  await page.getByRole('button', { name: 'Sign out' }).click()
  const otherEmail = `sales-other-${stamp}@motors.example`
  await signUpDealer(page, 'Other Dealer', otherEmail)
  await nav(page).getByRole('link', { name: 'Sales' }).click()
  await expect(page.getByText('No sales yet')).toBeVisible()
  await nav(page).getByRole('link', { name: 'Leads' }).click()
  await expect(page.getByText('No leads yet')).toBeVisible()
  const login = await request.post(`${API}/auth/login`, { data: { email: otherEmail, password: PASSWORD } })
  const headers = { Authorization: `Bearer ${(await login.json()).access_token}` }
  expect((await request.get(`${API}/sales/${saleId}`, { headers })).status()).toBe(404)
  expect((await request.get(`${API}/sales/${saleId}/invoice`, { headers })).status()).toBe(404)
})
