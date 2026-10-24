import { expect, test, type Page } from '@playwright/test'

const ADMIN = { email: 'e2e-admin@drivestock.dev', password: process.env.E2E_ADMIN_PASSWORD ?? 'e2e-admin-pass' }

async function signIn(page: Page, email: string, password: string) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('heading', { name: 'Inventory' })).toBeVisible()
}

function row(page: Page, title: string) {
  return page.getByRole('list', { name: 'Vehicles' }).getByRole('listitem').filter({ hasText: title })
}

test('customer registers, finds a car, buys it and sees stock drop', async ({ page }) => {
  const email = `buyer-${Date.now()}@example.com`
  await page.goto('/signup')
  await page.getByLabel('Full name').fill('E2E Buyer')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill('buyer-pass-123')
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByRole('heading', { name: 'Inventory' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Add vehicle' })).toHaveCount(0)

  await page.getByRole('searchbox', { name: 'Search' }).fill('kuga')
  await expect(page.getByRole('list', { name: 'Vehicles' }).getByRole('listitem')).toHaveCount(1)
  await expect(row(page, 'Ford Kuga')).toContainText('In stock · 6')

  await row(page, 'Ford Kuga').getByRole('button', { name: 'View details' }).click()
  const drawer = page.getByRole('dialog', { name: 'Ford Kuga' })
  await drawer.getByRole('button', { name: 'Increase quantity' }).click()
  await drawer.getByRole('button', { name: 'Purchase' }).click()
  await expect(drawer.getByText(/Purchase confirmed: 2 ×/)).toBeVisible()
  await expect(row(page, 'Ford Kuga')).toContainText('In stock · 4')

  // Persisted in the database: survives a full reload.
  await page.reload()
  await expect(row(page, 'Ford Kuga')).toContainText('In stock · 4')
})

test('out-of-stock vehicles cannot be purchased', async ({ page }) => {
  await signIn(page, ADMIN.email, ADMIN.password)
  await page.getByRole('radio', { name: 'Out of stock' }).check()
  await row(page, 'Renault Zoe').getByRole('button', { name: 'View details' }).click()
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Out of stock' })).toBeDisabled()
})

test('admin adds, edits, restocks and deletes a vehicle', async ({ page }) => {
  await signIn(page, ADMIN.email, ADMIN.password)

  await page.getByRole('button', { name: 'Add vehicle' }).click()
  const add = page.getByRole('dialog', { name: 'Add vehicle' })
  await add.getByLabel('Make').fill('Skoda')
  await add.getByLabel('Model').fill('Octavia')
  await add.getByLabel('Category').selectOption('wagon')
  await add.getByLabel('Price (USD)').fill('27990')
  await add.getByLabel('Initial stock').fill('0')
  await add.getByRole('button', { name: 'Create vehicle' }).click()
  await expect(row(page, 'Skoda Octavia')).toContainText('Out of stock')

  await row(page, 'Skoda Octavia').getByRole('button', { name: 'View details' }).click()
  const drawer = page.getByRole('dialog', { name: 'Skoda Octavia' })
  await drawer.getByRole('tab', { name: 'Edit' }).click()
  await drawer.getByLabel('Price (USD)').fill('26500')
  await drawer.getByRole('button', { name: 'Save changes' }).click()
  await expect(drawer.getByText('Changes saved.')).toBeVisible()
  await expect(row(page, 'Skoda Octavia')).toContainText('$26,500')

  await drawer.getByRole('tab', { name: 'Restock' }).click()
  await drawer.getByLabel('Units to add').fill('3')
  await drawer.getByRole('button', { name: 'Restock' }).click()
  await expect(drawer.getByText('Added 3 units. Now 3 in stock.')).toBeVisible()
  await expect(row(page, 'Skoda Octavia')).toContainText('In stock · 3')

  await drawer.getByRole('button', { name: 'Delete vehicle' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(row(page, 'Skoda Octavia')).toHaveCount(0)
})

test('the API rejects customer attempts at admin actions', async ({ page, request }) => {
  const email = `sneaky-${Date.now()}@example.com`
  await request.post('http://localhost:8001/api/auth/register', {
    data: { email, password: 'sneaky-pass-1', full_name: 'Sneaky' },
  })
  const login = await request.post('http://localhost:8001/api/auth/login', {
    data: { email, password: 'sneaky-pass-1' },
  })
  const { access_token } = await login.json()
  const headers = { Authorization: `Bearer ${access_token}` }

  const restock = await request.post('http://localhost:8001/api/vehicles/1/restock', { headers, data: { quantity: 5 } })
  const remove = await request.delete('http://localhost:8001/api/vehicles/1', { headers })

  expect(restock.status()).toBe(403)
  expect(remove.status()).toBe(403)
  await page.goto('/')
})
