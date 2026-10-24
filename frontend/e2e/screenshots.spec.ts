/**
 * Captures the README screenshots from the running app (real API + DB).
 * Skipped by default; run with: SCREENSHOTS=1 npx playwright test screenshots
 */
import { test, type Page } from '@playwright/test'

test.skip(!process.env.SCREENSHOTS, 'set SCREENSHOTS=1 to capture docs screenshots')

const OUT = '../docs/screenshots'
const ADMIN = { email: 'e2e-admin@drivestock.dev', password: process.env.E2E_ADMIN_PASSWORD ?? 'e2e-admin-pass' }

async function signIn(page: Page, email: string, password: string) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.getByRole('list', { name: 'Vehicles' }).waitFor()
}

// The e2e database is reset at the start of every Playwright run, so fixed emails are safe.
async function registerCustomer(page: Page, email = 'alex.morgan@example.com') {
  await page.goto('/signup')
  await page.getByLabel('Full name').fill('Alex Morgan')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill('customer-pass-1')
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.getByRole('list', { name: 'Vehicles' }).waitFor()
}

test('auth screens', async ({ page }) => {
  await page.goto('/login')
  await page.screenshot({ path: `${OUT}/01-sign-in.png` })
  await page.goto('/signup')
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.screenshot({ path: `${OUT}/02-register-validation.png` })
})

test('customer screens', async ({ page }) => {
  await registerCustomer(page)
  await page.screenshot({ path: `${OUT}/03-customer-inventory.png` })

  await page.getByRole('combobox', { name: 'Category' }).selectOption('suv')
  await page.getByRole('radio', { name: 'In stock' }).check()
  await page.getByRole('list', { name: 'Vehicles' }).getByRole('listitem').first().waitFor()
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${OUT}/04-filters.png` })

  await page.getByRole('button', { name: 'Clear all' }).click()
  const kuga = page.getByRole('listitem').filter({ hasText: 'Ford Kuga' })
  await kuga.getByRole('button', { name: 'View details' }).click()
  const drawer = page.getByRole('dialog')
  await drawer.getByRole('button', { name: 'Purchase' }).click()
  await drawer.getByText(/Purchase confirmed/).waitFor()
  await page.locator('main').evaluate((main) => main.scrollTo(0, 0))
  await page.screenshot({ path: `${OUT}/05-details-and-purchase.png` })
})

test('admin screens', async ({ page }) => {
  await signIn(page, ADMIN.email, ADMIN.password)
  await page.screenshot({ path: `${OUT}/06-admin-inventory.png` })

  await page.getByRole('button', { name: 'Add vehicle' }).click()
  await page.screenshot({ path: `${OUT}/07-admin-add-vehicle.png` })
  await page.keyboard.press('Escape')

  const zoe = page.getByRole('listitem').filter({ hasText: 'Renault Zoe' })
  await zoe.getByRole('button', { name: 'View details' }).click()
  const drawer = page.getByRole('dialog')
  await drawer.getByRole('tab', { name: 'Restock' }).click()
  await page.screenshot({ path: `${OUT}/08-admin-restock.png` })
  await drawer.getByRole('tab', { name: 'Edit' }).click()
  await page.screenshot({ path: `${OUT}/09-admin-edit.png` })
  await drawer.getByRole('button', { name: 'Delete vehicle' }).click()
  await page.screenshot({ path: `${OUT}/10-admin-delete-confirm.png` })
})

test('marketing site', async ({ browser }) => {
  for (const [name, path] of [
    ['15-landing', '/'],
    ['16-about', '/about'],
    ['17-pricing', '/pricing'],
  ] as const) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' })
    await page.goto(path)
    await page.waitForTimeout(300)
    await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true })
    await page.close()
  }
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' })
  await mobile.goto('/')
  await mobile.getByRole('button', { name: 'Open menu' }).click()
  await mobile.screenshot({ path: `${OUT}/18-landing-mobile-menu.png` })
  await mobile.close()
})

test('dealer onboarding', async ({ page }) => {
  await page.goto('/login?as=dealer')
  await page.screenshot({ path: `${OUT}/19-dealer-sign-in.png` })

  await page.goto('/dealer/register')
  await page.getByLabel('Full name').fill('Dana Dealer')
  await page.getByLabel('Email').fill('dana@motors.example')
  await page.getByLabel('Password').fill('dealer-pass-1')
  await page.getByLabel('Dealership name').fill('Dana Motors')
  await page.getByLabel('Phone (optional)').fill('+44 20 7946 0000')
  await page.screenshot({ path: `${OUT}/20-dealer-register.png`, fullPage: true })
  await page.getByRole('button', { name: 'Submit application' }).click()
  await page.getByRole('status', { name: 'Dealer application' }).waitFor()
  await page.screenshot({ path: `${OUT}/21-dealer-pending.png` })
  await page.getByRole('button', { name: 'Sign out' }).click()

  await signIn(page, ADMIN.email, ADMIN.password)
  await page.getByRole('link', { name: /Dealer applications/ }).click()
  await page.getByText('Dana Motors').waitFor()
  await page.screenshot({ path: `${OUT}/22-admin-dealer-applications.png` })
})

test('dark mode', async ({ page }) => {
  await registerCustomer(page, 'alex.dark@example.com')
  await page.getByRole('button', { name: 'Switch to dark mode' }).click()
  await page.screenshot({ path: `${OUT}/14-dark-mode.png` })
})

test('responsive layouts', async ({ browser }) => {
  for (const [name, viewport] of [
    ['11-tablet', { width: 900, height: 1100 }],
    ['12-mobile', { width: 390, height: 844 }],
  ] as const) {
    const page = await browser.newPage({ viewport })
    await registerCustomer(page, `alex.${name.slice(3)}@example.com`)
    await page.screenshot({ path: `${OUT}/${name}.png` })
    if (name === '12-mobile') {
      await page.getByRole('button', { name: 'View details' }).first().click()
      await page.getByRole('dialog').waitFor()
      await page.screenshot({ path: `${OUT}/13-mobile-details.png` })
    }
    await page.close()
  }
})
