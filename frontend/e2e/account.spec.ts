import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'

const PASSWORD = 'account-pass-1'

async function signUp(page: Page, path: '/signup' | '/dealer/register', name: string, email: string) {
  await page.goto(path)
  await page.getByLabel('Full name').fill(name)
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: /create (dealer )?account/i }).click()
  await expect(page).toHaveURL(/\/app/)
}

const nav = (page: Page) => page.getByRole('navigation', { name: 'Main' }).first()
const shot = (name: string) => (process.env.SCREENSHOT_DIR ? { path: `${process.env.SCREENSHOT_DIR}/${name}.png` } : undefined)

test('a customer finds their purchase, its invoice and their enquiry in My account', async ({ browser }) => {
  const stamp = Date.now()
  const dealer = await (await browser.newContext()).newPage()
  const customer = await (await browser.newContext()).newPage()

  // A dealer lists a vehicle.
  await signUp(dealer, '/dealer/register', 'Account Dealer', `account-dealer-${stamp}@motors.example`)
  await nav(dealer).getByRole('link', { name: 'Vehicles' }).click()
  await dealer.getByRole('button', { name: 'Add vehicle' }).click()
  const add = dealer.getByRole('dialog', { name: 'Add vehicle' })
  await add.getByLabel('Make').fill('Lotus')
  await add.getByLabel('Model').fill(`Emira ${stamp}`)
  await add.getByLabel('Price (USD)').fill('95000')
  await add.getByLabel('Initial stock').fill('3')
  await add.getByRole('button', { name: 'Create vehicle' }).click()
  await expect(dealer.getByRole('list', { name: 'Vehicles' })).toContainText(`Lotus Emira ${stamp}`)

  // A customer asks about it, then buys it.
  await signUp(customer, '/signup', 'Meera Iyer', `account-customer-${stamp}@example.com`)
  await customer.goto(`/app/inventory?q=${stamp}`)
  await customer.getByRole('button', { name: /view details/i }).first().click()
  const details = customer.getByRole('dialog', { name: /lotus emira/i })
  await details.getByRole('button', { name: 'Ask a question' }).click()
  await details.getByLabel('Your question').fill('Is the service history available?')
  await details.getByRole('button', { name: 'Send question' }).click()
  await expect(details.getByRole('link', { name: 'Track it in My account' })).toBeVisible()
  await details.getByRole('button', { name: /^purchase/i }).click()
  await details.getByRole('link', { name: 'Get the invoice in My account' }).click()

  // My account lists both.
  await expect(customer).toHaveURL(/\/app\/account$/)
  const purchases = customer.getByRole('list', { name: 'Purchases' })
  await expect(purchases).toContainText(`Lotus Emira ${stamp}`)
  await expect(purchases).toContainText('Sold by Account Dealer')
  await expect(purchases).toContainText('$95,000')
  const enquiries = customer.getByRole('list', { name: 'Enquiries' })
  await expect(enquiries).toContainText('Question')
  await expect(enquiries).toContainText('Sent')

  // The invoice downloads as a PDF.
  const download = customer.waitForEvent('download')
  await purchases.getByRole('button', { name: /download invoice/i }).click()
  const file = await download
  expect(file.suggestedFilename()).toMatch(/^invoice-\d+\.pdf$/)
  expect(readFileSync(await file.path()).subarray(0, 4).toString()).toBe('%PDF')

  // The dealer picks it up; the customer sees the progress but not the dealer's note.
  await nav(dealer).getByRole('link', { name: 'Leads' }).click()
  await dealer.getByRole('button', { name: 'Open Meera Iyer' }).click()
  const lead = dealer.getByRole('dialog', { name: 'Meera Iyer' })
  await lead.getByLabel('Status').selectOption('contacted')
  await expect(lead.getByRole('list', { name: 'History' })).toContainText('Status changed from new to contacted')
  await lead.getByRole('button', { name: 'Edit details' }).click()
  await dealer.getByLabel(/notes/i).fill('Keen buyer, offer floor mats')
  await dealer.getByRole('button', { name: /save/i }).click()

  await customer.reload()
  await expect(enquiries).toContainText('In progress')
  await expect(customer.getByText('Keen buyer')).toHaveCount(0)
  await customer.screenshot(shot('account-page'))
})
