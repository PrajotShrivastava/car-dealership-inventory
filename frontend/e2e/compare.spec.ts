import { expect, test, type Page } from '@playwright/test'

const PASSWORD = 'compare-pass-1'
const shot = (name: string) => (process.env.SCREENSHOT_DIR ? { path: `${process.env.SCREENSHOT_DIR}/${name}.png` } : undefined)

async function signUp(page: Page, path: '/signup' | '/dealer/register', email: string) {
  await page.goto(path)
  await page.getByLabel('Full name').fill('Compare Tester')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: /create (dealer )?account/i }).click()
  await expect(page).toHaveURL(/\/app/)
}

test('a customer compares vehicles side by side and shares the comparison', async ({ browser }) => {
  const stamp = Date.now()
  const dealer = await (await browser.newContext()).newPage()
  await signUp(dealer, '/dealer/register', `compare-dealer-${stamp}@motors.example`)
  await dealer.getByRole('navigation', { name: 'Main' }).first().getByRole('link', { name: 'Vehicles' }).click()
  const cars = [
    { model: `Corolla ${stamp}`, price: '21000', condition: 'used', mileage: '41000', features: 'Apple CarPlay, Heated seats' },
    { model: `Civic ${stamp}`, price: '23500', condition: 'certified', mileage: '12000', features: 'Apple CarPlay, Sunroof' },
  ]
  for (const car of cars) {
    await dealer.getByRole('button', { name: 'Add vehicle' }).click()
    const add = dealer.getByRole('dialog', { name: 'Add vehicle' })
    await add.getByLabel('Make').fill(car.model.startsWith('Corolla') ? 'Toyota' : 'Honda')
    await add.getByLabel('Model').fill(car.model)
    await add.getByLabel('Price (USD)').fill(car.price)
    await add.getByLabel('Condition').selectOption(car.condition)
    await add.getByLabel('Mileage').fill(car.mileage)
    await add.getByLabel('Features (optional)').fill(car.features)
    await add.getByRole('button', { name: 'Create vehicle' }).click()
    await expect(dealer.getByRole('list', { name: 'Vehicles' })).toContainText(car.model)
    await dealer.keyboard.press('Escape')
  }

  const customer = await (await browser.newContext()).newPage()
  await signUp(customer, '/signup', `compare-customer-${stamp}@example.com`)
  await customer.goto(`/app/inventory?q=${stamp}`)
  await customer.getByRole('button', { name: `Compare Toyota Corolla ${stamp}` }).click()
  await customer.getByRole('button', { name: `Compare Honda Civic ${stamp}` }).click()
  const bar = customer.getByRole('region', { name: 'Comparison' })
  await expect(bar).toContainText(`Honda Civic ${stamp}`)
  await customer.screenshot(shot('compare-bar'))
  await bar.getByRole('link', { name: 'Compare' }).click()

  const table = customer.getByRole('table', { name: 'Vehicle comparison' })
  await expect(table).toContainText('Lowest price')
  await expect(table).toContainText('Lowest mileage')
  await expect(table.getByRole('rowheader', { name: 'Sunroof' })).toBeVisible()
  await customer.screenshot(shot('compare-page'))

  // The link opens the same comparison in another browser.
  const shared = await (await browser.newContext()).newPage()
  await signUp(shared, '/signup', `compare-friend-${stamp}@example.com`)
  await shared.goto(customer.url())
  await expect(shared.getByRole('table', { name: 'Vehicle comparison' })).toContainText(`Honda Civic ${stamp}`)

  // Details open from the comparison.
  await table.getByRole('link', { name: `View details of Honda Civic ${stamp}` }).click()
  await expect(customer.getByRole('dialog', { name: new RegExp(`Honda Civic ${stamp}`) })).toBeVisible()
})
