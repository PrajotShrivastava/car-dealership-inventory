import { expect, test, type Page } from '@playwright/test'

const PASSWORD = 'session-pass-1'
const TOKEN_KEY = 'drivestock.token'

async function signUp(page: Page, email: string) {
  await page.goto('/signup')
  await page.getByLabel('Full name').fill('Sam Session')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page).toHaveURL(/\/app/)
}

async function signIn(page: Page, email: string, password = PASSWORD) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: /^sign in$/i }).click()
}

/** Replace the stored access token with one the API rejects, as when it expires. */
async function expireAccessToken(page: Page) {
  await page.evaluate((key) => localStorage.setItem(key, 'expired.access.token'), TOKEN_KEY)
}

const signedIn = (page: Page) => expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()
const signedOut = (page: Page) => expect(page.getByRole('button', { name: /^sign in$/i })).toBeVisible()

test('an expired access token is renewed from the refresh cookie, until signing out', async ({ page }) => {
  await signUp(page, `session-${Date.now()}@example.com`)

  await expireAccessToken(page)
  await page.reload()
  await signedIn(page)
  expect(await page.evaluate((key) => localStorage.getItem(key), TOKEN_KEY)).not.toBe('expired.access.token')

  // The cookie is httpOnly: page scripts can't see it.
  expect(await page.evaluate(() => document.cookie)).not.toContain('drivestock_refresh')

  await page.getByRole('button', { name: 'Sign out' }).click()
  await signedOut(page)
  await expireAccessToken(page)
  await page.goto('/app/inventory')
  await signedOut(page)
})

test('signing out of all devices ends the other sessions too', async ({ browser }) => {
  const email = `everywhere-${Date.now()}@example.com`
  const phone = await (await browser.newContext()).newPage()
  const laptop = await (await browser.newContext()).newPage()
  await signUp(phone, email)
  await signIn(laptop, email)
  await signedIn(laptop)

  await phone.goto('/app/account')
  await phone.getByRole('button', { name: 'Sign out of all devices' }).click()
  await phone.getByRole('alertdialog').getByRole('button', { name: 'Sign out everywhere' }).click()
  await signedOut(phone)

  // The laptop's access token was revoked and its refresh cookie no longer works.
  await laptop.reload()
  await signedOut(laptop)
})

test('repeated wrong passwords lock the email for a while', async ({ page }) => {
  const email = `locked-${Date.now()}@example.com`
  await signUp(page, email)
  await page.getByRole('button', { name: 'Sign out' }).click()

  for (let attempt = 0; attempt < 5; attempt++) {
    await signIn(page, email, 'wrong-password')
    await expect(page.getByRole('alert')).toContainText('Invalid email or password')
  }
  await signIn(page, email)

  await expect(page.getByRole('alert')).toContainText('Too many failed sign-in attempts')
})
