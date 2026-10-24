import { expect, test } from '@playwright/test'

test('visitor goes from the landing page to sign-up and lands in the app', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Every car on your lot')
  await expect(page.getByRole('figure', { name: 'Dashboard preview' })).toContainText('Sample data')

  await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Pricing' }).click()
  await expect(page).toHaveURL(/\/pricing$/)
  await expect(page.getByRole('note')).toContainText('Placeholder pricing')

  await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Get Started' }).click()
  await expect(page).toHaveURL(/\/signup$/)
  await page.getByLabel('Full name').fill('Landing Visitor')
  await page.getByLabel('Email').fill(`visitor-${Date.now()}@example.com`)
  await page.getByLabel('Password').fill('visitor-pass-1')
  await page.getByRole('button', { name: 'Create account' }).click()

  await expect(page).toHaveURL(/\/app$/)
  await expect(page.getByRole('heading', { name: 'Inventory' })).toBeVisible()

  // Public pages stay reachable when signed in, with a way back to the app.
  await page.goto('/about')
  await expect(page.getByRole('heading', { level: 1, name: 'About DriveStock' })).toBeVisible()
  await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Open dashboard' }).click()
  await expect(page).toHaveURL(/\/app$/)
})

test('Features link scrolls to the features section', async ({ page }) => {
  await page.goto('/about')
  await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Features' }).click()
  await expect(page).toHaveURL(/\/#features$/)
  await expect(page.getByRole('region', { name: 'Features' })).toBeInViewport()
})

test('deep app links survive the sign-in detour', async ({ page }) => {
  await page.goto('/app?category=suv')
  await expect(page).toHaveURL(/\/login$/)
  await page.getByLabel('Email').fill('e2e-admin@drivestock.dev')
  await page.getByLabel('Password').fill(process.env.E2E_ADMIN_PASSWORD ?? 'e2e-admin-pass')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/app\?category=suv$/)
  await expect(page.getByRole('combobox', { name: 'Category' })).toHaveValue('suv')
})
