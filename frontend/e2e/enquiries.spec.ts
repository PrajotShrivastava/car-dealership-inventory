import { expect, test, type Page } from '@playwright/test'

const PASSWORD = 'enquiry-pass-1'

async function signUp(page: Page, path: '/signup' | '/dealer/register', name: string, email: string) {
  await page.goto(path)
  await page.getByLabel('Full name').fill(name)
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: /create (dealer )?account/i }).click()
  await expect(page).toHaveURL(/\/app/)
}

const nav = (page: Page) => page.getByRole('navigation', { name: 'Main' }).first()

test("a customer's test drive request reaches the dealer as a lead", async ({ browser }) => {
  const stamp = Date.now()
  const dealer = await (await browser.newContext()).newPage()
  const customer = await (await browser.newContext()).newPage()

  // A dealer lists a vehicle.
  await signUp(dealer, '/dealer/register', 'Enquiry Dealer', `enquiry-dealer-${stamp}@motors.example`)
  await nav(dealer).getByRole('link', { name: 'Vehicles' }).click()
  await dealer.getByRole('button', { name: 'Add vehicle' }).click()
  const add = dealer.getByRole('dialog', { name: 'Add vehicle' })
  await add.getByLabel('Make').fill('Polestar')
  await add.getByLabel('Model').fill(`Two ${stamp}`)
  await add.getByLabel('Price (USD)').fill('29000')
  await add.getByLabel('Initial stock').fill('2')
  await add.getByRole('button', { name: 'Create vehicle' }).click()
  await expect(dealer.getByRole('list', { name: 'Vehicles' })).toContainText(`Polestar Two ${stamp}`)

  // A customer finds it and asks for a test drive.
  const customerEmail = `enquiry-customer-${stamp}@example.com`
  await signUp(customer, '/signup', 'Priya Shah', customerEmail)
  await customer.goto(`/app/inventory?q=${stamp}`)
  await customer.getByRole('button', { name: /view details/i }).first().click()
  const details = customer.getByRole('dialog', { name: /polestar two/i })
  await details.getByRole('button', { name: 'Book a test drive' }).click()
  const form = details.getByRole('form', { name: 'Book a test drive' })
  await form.getByLabel('Preferred date').fill('2099-03-14')
  await form.getByLabel(/anything the dealer should know/i).fill('Weekday evenings suit me.')
  await form.getByLabel('Phone (optional)').fill('+44 7700 900123')
  if (process.env.SCREENSHOT_DIR) await details.screenshot({ path: `${process.env.SCREENSHOT_DIR}/enquiry-form.png` })
  await form.getByRole('button', { name: 'Request test drive' }).click()
  await expect(details.getByText('Test drive requested. The dealer will confirm Mar 14, 2099 with you.')).toBeVisible()
  if (process.env.SCREENSHOT_DIR) await details.screenshot({ path: `${process.env.SCREENSHOT_DIR}/enquiry-sent.png` })

  // Asking again while it's open is refused with a reason.
  await details.getByRole('button', { name: 'Book a test drive' }).click()
  await form.getByLabel('Preferred date').fill('2099-03-15')
  await form.getByRole('button', { name: 'Request test drive' }).click()
  await expect(form.getByRole('alert')).toContainText("You've already sent a test drive request")

  // The dealer sees it among today's follow-ups, with everything the customer sent.
  await nav(dealer).getByRole('link', { name: 'Leads' }).click()
  await expect(dealer.getByRole('button', { name: 'Due today 1' })).toBeVisible()
  await dealer.getByRole('button', { name: 'Open Priya Shah' }).click()
  const lead = dealer.getByRole('dialog', { name: 'Priya Shah' })
  await expect(lead).toContainText(customerEmail)
  await expect(lead).toContainText('+44 7700 900123')
  await expect(lead).toContainText('Test drive request')
  await expect(lead).toContainText('Preferred test drive date: Sat 14 Mar 2099')
  await expect(lead).toContainText('Weekday evenings suit me.')
  if (process.env.SCREENSHOT_DIR) await lead.screenshot({ path: `${process.env.SCREENSHOT_DIR}/enquiry-lead.png` })
})
