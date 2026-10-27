import { expect, test, type Page } from '@playwright/test'

const PASSWORD = 'dealer-pass-1'

async function signUpDealer(page: Page, name: string, email: string) {
  await page.goto('/login')
  await page.getByRole('tab', { name: 'Dealer Sign In' }).click()
  await page.getByRole('link', { name: 'Register as a Dealer' }).click()
  await page.getByLabel('Full name').fill(name)
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create dealer account' }).click()
  await expect(page).toHaveURL(/\/app\/dashboard$/)
}

async function signOut(page: Page) {
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page).toHaveURL(/\/login$/)
}

function figure(page: Page, name: string) {
  return page.getByRole('region', { name: 'Key figures' }).getByRole('group', { name })
}

test('a dealer sees their own sales on the dashboard, and no one else does', async ({ page }) => {
  const stamp = Date.now()
  const dealerEmail = `dash-dealer-${stamp}@motors.example`

  // 1. A new dealer lands on an empty dashboard.
  await signUpDealer(page, 'Dash Dealer', dealerEmail)
  await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible()
  await expect(figure(page, 'Total listings')).toContainText('0')
  await expect(page.getByRole('region', { name: 'Sales overview' })).toContainText('No sales yet')

  // 2. The Add vehicle shortcut opens the form in Inventory.
  await page.getByRole('button', { name: 'Add vehicle' }).click()
  await expect(page).toHaveURL(/\/app\/inventory$/)
  const add = page.getByRole('dialog', { name: 'Add vehicle' })
  await add.getByLabel('Make').fill('Polestar')
  await add.getByLabel('Model').fill('2')
  await add.getByLabel('Category').selectOption('sedan')
  await add.getByLabel('Fuel type').selectOption('electric')
  await add.getByLabel('Price (USD)').fill('25000')
  await add.getByLabel('Initial stock').fill('5')
  await add.getByRole('button', { name: 'Create vehicle' }).click()
  await expect(page.getByRole('list', { name: 'Vehicles' })).toContainText('Polestar 2')
  await signOut(page)

  // 3. A customer buys three units in one purchase.
  await page.goto('/signup')
  await page.getByLabel('Full name').fill('Dash Buyer')
  await page.getByLabel('Email').fill(`dash-buyer-${stamp}@example.com`)
  await page.getByLabel('Password').fill('buyer-pass-123')
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.getByRole('searchbox', { name: 'Search' }).fill('polestar')
  const row = page.getByRole('list', { name: 'Vehicles' }).getByRole('listitem').filter({ hasText: 'Polestar 2' })
  await row.getByRole('button', { name: 'View details' }).click()
  const drawer = page.getByRole('dialog', { name: 'Polestar 2' })
  await drawer.getByRole('button', { name: 'Increase quantity' }).click()
  await drawer.getByRole('button', { name: 'Increase quantity' }).click()
  await drawer.getByRole('button', { name: 'Purchase' }).click()
  await expect(drawer.getByText(/Purchase confirmed: 3 ×/)).toBeVisible()
  await drawer.getByRole('button', { name: 'Close details' }).click()
  await signOut(page)

  // 4. The dealer signs in straight to the dashboard and sees the sale. (A fresh visit: the
  // sign-in page otherwise offers to return to the page the previous user was on.)
  await page.goto('/')
  await page.goto('/login')
  await page.getByLabel('Email').fill(dealerEmail)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/app\/dashboard$/)
  await expect(figure(page, 'Units sold')).toContainText('3')
  await expect(figure(page, 'Sales this month')).toContainText('3')
  await expect(figure(page, 'Total sales revenue')).toContainText('$75,000')
  await expect(figure(page, 'Available stock')).toContainText('2')
  await expect(figure(page, 'Inventory value')).toContainText('$50,000')
  const sales = page.getByRole('region', { name: 'Recent sales' })
  await expect(sales.getByRole('row').nth(1)).toContainText('Polestar 2')
  await expect(sales.getByRole('row').nth(1)).toContainText('$75,000')
  await expect(page.getByRole('region', { name: 'Performance insights' })).toContainText('Polestar 2')

  // Dashboard and Inventory are separate tabs in the sidebar.
  const nav = page.getByRole('navigation', { name: 'Main' }).first()
  await nav.getByRole('link', { name: 'Vehicles' }).click()
  await expect(page).toHaveURL(/\/app\/inventory$/)
  await nav.getByRole('link', { name: 'Dashboard' }).click()
  await expect(page).toHaveURL(/\/app\/dashboard$/)
  await signOut(page)

  // 5. Another dealer sees none of it, in the dashboard or the inventory.
  await signUpDealer(page, 'Other Dealer', `dash-other-${stamp}@motors.example`)
  await expect(figure(page, 'Units sold')).toContainText('0')
  await expect(figure(page, 'Total listings')).toContainText('0')
  await expect(page.getByRole('region', { name: 'Recent sales' })).toContainText('No sales recorded yet')
  await page.goto('/app/inventory')
  await expect(page.getByText('Your inventory is empty')).toBeVisible()
})
