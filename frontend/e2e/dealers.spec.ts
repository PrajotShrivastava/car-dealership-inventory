import { expect, test, type Page } from '@playwright/test'

const ADMIN = { email: 'e2e-admin@drivestock.dev', password: process.env.E2E_ADMIN_PASSWORD ?? 'e2e-admin-pass' }

async function signIn(page: Page, email: string, password: string, dealer = false) {
  await page.goto(dealer ? '/login?as=dealer' : '/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/\/app/)
}

test('dealer applies, admin approves, dealer gets inventory tools', async ({ page, request }) => {
  const email = `dealer-${Date.now()}@motors.example`

  // 1. Apply via Dealer Sign In -> Register as a Dealer
  await page.goto('/login')
  await page.getByRole('tab', { name: 'Dealer Sign In' }).click()
  await page.getByRole('link', { name: 'Register as a Dealer' }).click()
  await page.getByLabel('Full name').fill('Dana Dealer')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill('dealer-pass-1')
  await page.getByLabel('Dealership name').fill('Dana Motors')
  await page.getByRole('button', { name: 'Submit application' }).click()

  // 2. Pending: customer access only, enforced by the API too
  await expect(page.getByRole('status', { name: 'Dealer application' })).toContainText('pending review')
  await expect(page.getByRole('button', { name: 'Add vehicle' })).toHaveCount(0)
  const login = await request.post('http://localhost:8001/api/auth/login', { data: { email, password: 'dealer-pass-1' } })
  const headers = { Authorization: `Bearer ${(await login.json()).access_token}` }
  // quantity 0 never changes data: 403 = not allowed; 422 = allowed but invalid input.
  const probeRestock = () =>
    request.post('http://localhost:8001/api/vehicles/1/restock', { headers, data: { quantity: 0 } })
  expect((await probeRestock()).status()).toBe(403)
  await page.getByRole('button', { name: 'Sign out' }).click()

  // 3. Admin approves
  await signIn(page, ADMIN.email, ADMIN.password, true)
  await page.getByRole('link', { name: /Dealer applications/ }).click()
  const card = page.getByRole('listitem').filter({ hasText: 'Dana Motors' })
  await card.getByRole('button', { name: 'Approve' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Approve', exact: true }).click()
  await expect(page.getByText('Dana Motors')).toHaveCount(0)
  await page.getByRole('button', { name: 'Sign out' }).click()

  // 4. Dealer signs in and now has the management view
  await signIn(page, email, 'dealer-pass-1', true)
  await expect(page.getByRole('button', { name: 'Add vehicle' })).toBeVisible()
  await expect(page.getByRole('status', { name: 'Dealer application' })).toHaveCount(0)
  expect((await probeRestock()).status()).toBe(422)
})

test('a rejected applicant keeps customer access and sees the note', async ({ page }) => {
  const email = `rejected-${Date.now()}@motors.example`
  await page.goto('/dealer/register')
  await page.getByLabel('Full name').fill('Rex Rejected')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill('dealer-pass-1')
  await page.getByLabel('Dealership name').fill('Rex Autos')
  await page.getByRole('button', { name: 'Submit application' }).click()
  await expect(page.getByRole('status', { name: 'Dealer application' })).toBeVisible()
  await page.getByRole('button', { name: 'Sign out' }).click()

  await signIn(page, ADMIN.email, ADMIN.password)
  await page.goto('/app/dealer-applications')
  await page.getByRole('listitem').filter({ hasText: 'Rex Autos' }).getByRole('button', { name: 'Reject' }).click()
  const dialog = page.getByRole('alertdialog')
  await dialog.getByLabel('Note (optional)').fill('Could not verify the business.')
  await dialog.getByRole('button', { name: 'Reject', exact: true }).click()
  await expect(page.getByText('Rex Autos')).toHaveCount(0)
  await page.getByRole('button', { name: 'Sign out' }).click()

  await signIn(page, email, 'dealer-pass-1')
  await expect(page.getByRole('status', { name: 'Dealer application' })).toContainText('Could not verify the business.')
  await expect(page.getByRole('button', { name: 'Add vehicle' })).toHaveCount(0)
})

test('customers cannot open the admin review page', async ({ page }) => {
  await page.goto('/signup')
  await page.getByLabel('Full name').fill('Curious Customer')
  await page.getByLabel('Email').fill(`curious-${Date.now()}@example.com`)
  await page.getByLabel('Password').fill('customer-pass-1')
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page).toHaveURL(/\/app$/)

  await page.goto('/app/dealer-applications')
  await expect(page).toHaveURL(/\/app$/)
  await expect(page.getByRole('link', { name: /Dealer applications/ })).toHaveCount(0)
})
