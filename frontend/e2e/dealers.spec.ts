import { expect, test } from '@playwright/test'

test('dealer signs up and manages inventory straight away, without admin approval', async ({ page, request }) => {
  const email = `dealer-${Date.now()}@motors.example`

  // 1. Dealer Sign In -> Register as a Dealer
  await page.goto('/login')
  await page.getByRole('tab', { name: 'Dealer Sign In' }).click()
  await page.getByRole('link', { name: 'Register as a Dealer' }).click()
  await page.getByLabel('Full name').fill('Dana Dealer')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill('dealer-pass-1')
  await page.getByRole('button', { name: 'Create dealer account' }).click()
  await expect(page).toHaveURL(/\/app\/dashboard$/)

  // 2. A dealer at once: tools visible, no pending banner, no admin-only page
  await expect(page.getByRole('button', { name: 'Add vehicle' })).toBeVisible()
  await expect(page.getByText('dealer', { exact: true })).toBeVisible()
  await expect(page.getByRole('status', { name: 'Dealer application' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: /Dealer applications/ })).toHaveCount(0)

  // 3. Adds a vehicle with a photo, edits it, then deletes it
  await page.getByRole('button', { name: 'Add vehicle' }).click()
  const add = page.getByRole('dialog', { name: 'Add vehicle' })
  await add.getByLabel('Make').fill('Kia')
  await add.getByLabel('Model').fill('Sportage')
  await add.getByLabel('Category').selectOption('suv')
  await add.getByLabel('Price (USD)').fill('29990')
  await add.getByLabel(/^Photos/).setInputFiles('e2e/fixtures/test-car.jpg')
  await add.getByRole('button', { name: 'Create vehicle' }).click()
  const row = page.getByRole('list', { name: 'Vehicles' }).getByRole('listitem').filter({ hasText: 'Kia Sportage' })
  await expect(row.getByRole('img', { name: /Kia Sportage/ })).toBeVisible()
  await row.getByRole('button', { name: 'View details' }).click()
  const drawer = page.getByRole('dialog', { name: 'Kia Sportage' })
  await drawer.getByRole('tab', { name: 'Edit' }).click()
  await drawer.getByLabel('Price (USD)').fill('28990')
  await drawer.getByRole('button', { name: 'Save changes' }).click()
  await expect(drawer.getByText('Changes saved.')).toBeVisible()

  // 4. The API agrees: inventory changes allowed, application review not
  const login = await request.post('http://localhost:8001/api/auth/login', { data: { email, password: 'dealer-pass-1' } })
  expect((await login.json()).user.role).toBe('dealer')
  const headers = { Authorization: `Bearer ${(await login.json()).access_token}` }
  // quantity 0 never changes data: 422 = allowed but invalid input (403 would mean not allowed).
  expect((await request.post('http://localhost:8001/api/vehicles/1/restock', { headers, data: { quantity: 0 } })).status()).toBe(422)
  expect((await request.get('http://localhost:8001/api/dealer-applications', { headers })).status()).toBe(403)

  await page.goto('/app/dealer-applications')
  await expect(page).toHaveURL(/\/app\/inventory$/)

  // Clean up so reruns start from the same state.
  await page.getByRole('list', { name: 'Vehicles' }).getByRole('listitem').filter({ hasText: 'Kia Sportage' }).getByRole('button', { name: 'View details' }).click()
  await page.getByRole('button', { name: 'Delete vehicle' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click()
  await expect(page.getByText('Kia Sportage')).toHaveCount(0)
})

test('customer sign-up still creates a customer without inventory tools', async ({ page, request }) => {
  const email = `customer-${Date.now()}@example.com`
  await page.goto('/signup')
  await page.getByLabel('Full name').fill('Casey Customer')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill('customer-pass-1')
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page).toHaveURL(/\/app\/inventory$/)
  await expect(page.getByRole('heading', { name: 'Inventory', level: 1 })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Add vehicle' })).toHaveCount(0)

  const login = await request.post('http://localhost:8001/api/auth/login', { data: { email, password: 'customer-pass-1' } })
  expect((await login.json()).user.role).toBe('customer')
})

test('customers cannot open the admin review page', async ({ page }) => {
  await page.goto('/signup')
  await page.getByLabel('Full name').fill('Curious Customer')
  await page.getByLabel('Email').fill(`curious-${Date.now()}@example.com`)
  await page.getByLabel('Password').fill('customer-pass-1')
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page).toHaveURL(/\/app\/inventory$/)

  await page.goto('/app/dealer-applications')
  await expect(page).toHaveURL(/\/app\/inventory$/)
  await expect(page.getByRole('link', { name: /Dealer applications/ })).toHaveCount(0)
})
