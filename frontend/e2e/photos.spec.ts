import { expect, test, type Page } from '@playwright/test'

const ADMIN = { email: 'e2e-admin@drivestock.dev', password: process.env.E2E_ADMIN_PASSWORD ?? 'e2e-admin-pass' }
const PHOTO = 'e2e/fixtures/test-car.jpg'

async function signIn(page: Page) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(ADMIN.email)
  await page.getByLabel('Password').fill(ADMIN.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('heading', { name: 'Inventory' })).toBeVisible()
}

function row(page: Page, title: string) {
  return page.getByRole('list', { name: 'Vehicles' }).getByRole('listitem').filter({ hasText: title })
}

/** The browser actually decoded the image (not a broken-image icon). */
async function expectLoaded(image: ReturnType<Page['getByRole']>) {
  await expect(image).toBeVisible()
  await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth)).toBeGreaterThan(0)
}

test('admin uploads photos with a new vehicle, adds and removes more, and they persist', async ({ page }) => {
  await signIn(page)

  await page.getByRole('button', { name: 'Add vehicle' }).click()
  const add = page.getByRole('dialog', { name: 'Add vehicle' })
  await add.getByLabel('Make').fill('Mazda')
  await add.getByLabel('Model').fill('CX-5')
  await add.getByLabel('Category').selectOption('suv')
  await add.getByLabel('Price (USD)').fill('31990')
  await add.getByLabel(/^Photos/).setInputFiles([PHOTO, PHOTO])
  await expect(add.getByText('2 of 10')).toBeVisible()
  await add.getByRole('button', { name: 'Create vehicle' }).click()

  // Cover photo in the list, served by the API from the uploaded (re-encoded) file.
  const thumb = row(page, 'Mazda CX-5').getByRole('img', { name: /Mazda CX-5/ })
  await expectLoaded(thumb)
  await expect(thumb).toHaveAttribute('src', /\/api\/media\/vehicles\/[0-9a-f]{32}-thumb\.webp$/)

  await row(page, 'Mazda CX-5').getByRole('button', { name: 'View details' }).click()
  const drawer = page.getByRole('dialog', { name: 'Mazda CX-5' })
  await expectLoaded(drawer.getByRole('img', { name: /photo 1 of 2/ }))

  // Edit tab: add one more, then remove one.
  await drawer.getByRole('tab', { name: 'Edit' }).click()
  await expect(drawer.getByText('2 of 10 photos')).toBeVisible()
  await drawer.getByLabel('Add photos').setInputFiles(PHOTO)
  await expect(drawer.getByText('3 of 10 photos')).toBeVisible()
  await drawer.getByRole('button', { name: 'Remove photo 1' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Remove' }).click()
  await expect(drawer.getByText('2 of 10 photos')).toBeVisible()

  // Persisted: still there after a full reload (the open drawer is kept in the URL).
  await page.reload()
  await expectLoaded(page.getByRole('dialog', { name: 'Mazda CX-5' }).getByRole('img', { name: /photo 1 of 2/ }))
  await expectLoaded(row(page, 'Mazda CX-5').getByRole('img', { name: /Mazda CX-5/ }))

  // Clean up so reruns start from the same state.
  await page.getByRole('button', { name: 'Delete vehicle' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click()
  await expect(row(page, 'Mazda CX-5')).toHaveCount(0)
})

test('the API rejects a file that is not an image, whatever its name and type say', async ({ request }) => {
  const login = await request.post('http://localhost:8001/api/auth/login', { data: ADMIN })
  const headers = { Authorization: `Bearer ${(await login.json()).access_token}` }

  const response = await request.post('http://localhost:8001/api/vehicles/1/photos', {
    headers,
    multipart: { files: { name: 'car.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('not really a photo') } },
  })

  expect(response.status()).toBe(415)
  expect((await response.json()).error.code).toBe('UNSUPPORTED_PHOTO_TYPE')
})
