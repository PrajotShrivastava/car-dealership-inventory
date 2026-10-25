import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw/http'
import { describe, expect, it } from 'vitest'
import { API_URL } from '../../api/client'
import { fakePhoto, getVehicle, seedUser, seedVehicle } from '../../test/handlers'
import { server } from '../../test/server'
import { renderApp } from '../../test/utils'

const MEDIA = new URL(API_URL).origin

const photoFile = (name = 'car.jpg', type = 'image/jpeg', bytes = 1024) =>
  new File([new Uint8Array(bytes)], name, { type })

async function vehicleRow(title: string) {
  const list = await screen.findByRole('list', { name: /vehicles/i })
  return within(list).getByText(title).closest('li')!
}

async function openDetails(user: ReturnType<typeof renderApp>['user'], title: string) {
  await user.click(within(await vehicleRow(title)).getByRole('button', { name: /view details/i }))
  return screen.findByRole('dialog', { name: new RegExp(title, 'i') })
}

async function openEdit(user: ReturnType<typeof renderApp>['user'], title: string) {
  const dialog = await openDetails(user, title)
  await user.click(within(dialog).getByRole('tab', { name: /edit/i }))
  return dialog
}

async function fillRequiredFields(user: ReturnType<typeof renderApp>['user'], dialog: HTMLElement) {
  await user.type(within(dialog).getByLabelText(/^make/i), 'Skoda')
  await user.type(within(dialog).getByLabelText(/^model/i), 'Octavia')
  await user.type(within(dialog).getByLabelText(/^price/i), '27990')
}

describe('vehicle photos in the inventory', () => {
  it('shows the first photo as the list thumbnail', async () => {
    const [cover, second] = [fakePhoto(), fakePhoto()]
    seedVehicle({ make: 'Ford', model: 'Kuga', year: 2024, photos: [cover, second] })
    renderApp({ path: '/app', user: seedUser('customer') })

    const img = within(await vehicleRow('Ford Kuga')).getByRole('img', { name: '2024 Ford Kuga' })

    expect(img).toHaveAttribute('src', `${MEDIA}${cover.thumb_url}`)
    expect(img).toHaveAttribute('loading', 'lazy')
  })

  it('keeps the body-style drawing for vehicles without photos', async () => {
    seedVehicle({ make: 'Ford', model: 'Kuga', photos: [] })
    renderApp({ path: '/app', user: seedUser('customer') })

    const row = await vehicleRow('Ford Kuga')

    expect(within(row).getByTestId('vehicle-photo-fallback')).toBeInTheDocument()
    expect(within(row).queryByRole('img', { name: /ford kuga/i })).not.toBeInTheDocument()
  })

  it('falls back to the drawing when a photo fails to load', async () => {
    seedVehicle({ make: 'Ford', model: 'Kuga', year: 2024, photos: [fakePhoto()] })
    renderApp({ path: '/app', user: seedUser('customer') })
    const row = await vehicleRow('Ford Kuga')

    fireEvent.error(within(row).getByRole('img', { name: '2024 Ford Kuga' }))

    expect(within(row).getByTestId('vehicle-photo-fallback')).toBeInTheDocument()
  })

  it('shows every photo in the details drawer and lets visitors switch between them', async () => {
    const photos = [fakePhoto(), fakePhoto(), fakePhoto()]
    seedVehicle({ make: 'Ford', model: 'Kuga', year: 2024, photos })
    const { user } = renderApp({ path: '/app', user: seedUser('customer') })

    const dialog = await openDetails(user, 'Ford Kuga')
    const main = within(dialog).getByRole('img', { name: '2024 Ford Kuga, photo 1 of 3' })
    expect(main).toHaveAttribute('src', `${MEDIA}${photos[0].url}`)

    await user.click(within(dialog).getByRole('button', { name: 'Show photo 3 of 3' }))

    expect(within(dialog).getByRole('img', { name: '2024 Ford Kuga, photo 3 of 3' })).toHaveAttribute(
      'src',
      `${MEDIA}${photos[2].url}`,
    )
    expect(within(dialog).getByRole('button', { name: 'Show photo 3 of 3' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(dialog).queryByText(/no photo available/i)).not.toBeInTheDocument()
  })

  it('shows a single photo without thumbnail buttons', async () => {
    seedVehicle({ make: 'Ford', model: 'Kuga', year: 2024, photos: [fakePhoto()] })
    const { user } = renderApp({ path: '/app', user: seedUser('customer') })

    const dialog = await openDetails(user, 'Ford Kuga')

    expect(within(dialog).getByRole('img', { name: '2024 Ford Kuga' })).toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: /show photo/i })).not.toBeInTheDocument()
  })

  it('does not offer photo management to customers', async () => {
    seedVehicle({ make: 'Ford', model: 'Kuga', photos: [fakePhoto()] })
    const { user } = renderApp({ path: '/app', user: seedUser('customer') })

    const dialog = await openDetails(user, 'Ford Kuga')

    expect(within(dialog).queryByRole('button', { name: /remove photo/i })).not.toBeInTheDocument()
    expect(within(dialog).queryByLabelText(/photos/i)).not.toBeInTheDocument()
  })
})

describe('admin: photos when adding a vehicle', () => {
  it('uploads the chosen photos with the new vehicle', async () => {
    const { user } = renderApp({ path: '/app', user: seedUser('admin') })
    await user.click(await screen.findByRole('button', { name: /add vehicle/i }))
    const dialog = await screen.findByRole('dialog', { name: /add vehicle/i })
    await fillRequiredFields(user, dialog)

    await user.upload(within(dialog).getByLabelText(/^photos/i), [photoFile('front.jpg'), photoFile('side.png', 'image/png')])
    expect(within(dialog).getByText('front.jpg')).toBeInTheDocument()
    expect(within(dialog).getByText('side.png')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: /create vehicle/i }))

    const row = await vehicleRow('Skoda Octavia')
    expect(await within(row).findByRole('img', { name: /skoda octavia/i })).toBeInTheDocument()
    const details = await openDetails(user, 'Skoda Octavia')
    expect(within(details).getByRole('img', { name: /photo 1 of 2/i })).toBeInTheDocument()
  })

  it('lets the admin drop a chosen photo before saving', async () => {
    const { user } = renderApp({ path: '/app', user: seedUser('admin') })
    await user.click(await screen.findByRole('button', { name: /add vehicle/i }))
    const dialog = await screen.findByRole('dialog', { name: /add vehicle/i })

    await user.upload(within(dialog).getByLabelText(/^photos/i), [photoFile('front.jpg'), photoFile('side.jpg')])
    await user.click(within(dialog).getByRole('button', { name: 'Remove front.jpg' }))

    expect(within(dialog).queryByText('front.jpg')).not.toBeInTheDocument()
    expect(within(dialog).getByText('side.jpg')).toBeInTheDocument()
  })

  it('rejects unsupported, oversized and too many photos before uploading', async () => {
    const { user } = renderApp({ path: '/app', user: seedUser('admin') })
    const picker = userEvent.setup({ applyAccept: false })
    await user.click(await screen.findByRole('button', { name: /add vehicle/i }))
    const dialog = await screen.findByRole('dialog', { name: /add vehicle/i })
    const input = within(dialog).getByLabelText(/^photos/i)

    await picker.upload(input, photoFile('anim.gif', 'image/gif'))
    expect(within(dialog).getByText(/anim\.gif is not a JPEG, PNG or WebP image/i)).toBeInTheDocument()

    await picker.upload(input, photoFile('huge.jpg', 'image/jpeg', 5 * 1024 * 1024 + 1))
    expect(within(dialog).getByText(/huge\.jpg is larger than 5 MB/i)).toBeInTheDocument()

    await picker.upload(input, Array.from({ length: 11 }, (_, i) => photoFile(`car-${i}.jpg`)))
    expect(within(dialog).getByText(/you can add up to 10 photos/i)).toBeInTheDocument()
    expect(within(dialog).queryByText('car-0.jpg')).not.toBeInTheDocument()
  })

  it('keeps the new vehicle and opens it for editing if the photo upload fails', async () => {
    server.use(
      http.post(`${API_URL}/vehicles/:id/photos`, () =>
        HttpResponse.json({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } }, { status: 500 }),
      ),
    )
    const { user } = renderApp({ path: '/app', user: seedUser('admin') })
    await user.click(await screen.findByRole('button', { name: /add vehicle/i }))
    const addDialog = await screen.findByRole('dialog', { name: /add vehicle/i })
    await fillRequiredFields(user, addDialog)
    await user.upload(within(addDialog).getByLabelText(/^photos/i), photoFile())
    await user.click(within(addDialog).getByRole('button', { name: /create vehicle/i }))

    const dialog = await screen.findByRole('dialog', { name: /skoda octavia/i })
    expect(within(dialog).getByRole('tab', { name: /edit/i })).toHaveAttribute('aria-selected', 'true')
    expect(within(dialog).getByRole('alert')).toHaveTextContent(
      /vehicle saved, but the photos could not be uploaded: an unexpected error occurred/i,
    )
    const list = await screen.findByRole('list', { name: /vehicles/i })
    expect(within(list).getAllByText('Skoda Octavia')).toHaveLength(1)
  })
})

describe('admin: managing photos of an existing vehicle', () => {
  it('lists the current photos in the Edit tab', async () => {
    seedVehicle({ make: 'Ford', model: 'Kuga', photos: [fakePhoto(), fakePhoto()] })
    const { user } = renderApp({ path: '/app', user: seedUser('admin') })

    const dialog = await openEdit(user, 'Ford Kuga')

    expect(within(dialog).getByText('2 of 10 photos')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Remove photo 1' })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Remove photo 2' })).toBeInTheDocument()
  })

  it('adds more photos straight away', async () => {
    const vehicle = seedVehicle({ make: 'Ford', model: 'Kuga', photos: [fakePhoto()] })
    const { user } = renderApp({ path: '/app', user: seedUser('admin') })
    const dialog = await openEdit(user, 'Ford Kuga')

    await user.upload(within(dialog).getByLabelText(/add photos/i), [photoFile(), photoFile()])

    expect(await within(dialog).findByText('3 of 10 photos')).toBeInTheDocument()
    expect(getVehicle(vehicle.id)?.photos).toHaveLength(3)
  })

  it('removes a photo after confirmation', async () => {
    const [keep, remove] = [fakePhoto(), fakePhoto()]
    const vehicle = seedVehicle({ make: 'Ford', model: 'Kuga', photos: [keep, remove] })
    const { user } = renderApp({ path: '/app', user: seedUser('admin') })
    const dialog = await openEdit(user, 'Ford Kuga')

    await user.click(within(dialog).getByRole('button', { name: 'Remove photo 2' }))
    const confirm = await screen.findByRole('alertdialog', { name: /remove this photo/i })
    await user.click(within(confirm).getByRole('button', { name: /^remove$/i }))

    expect(await within(dialog).findByText('1 of 10 photos')).toBeInTheDocument()
    expect(getVehicle(vehicle.id)?.photos).toEqual([keep])
  })

  it('keeps the photo when removal is cancelled', async () => {
    const vehicle = seedVehicle({ make: 'Ford', model: 'Kuga', photos: [fakePhoto()] })
    const { user } = renderApp({ path: '/app', user: seedUser('admin') })
    const dialog = await openEdit(user, 'Ford Kuga')

    await user.click(within(dialog).getByRole('button', { name: 'Remove photo 1' }))
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: /cancel/i }))

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(getVehicle(vehicle.id)?.photos).toHaveLength(1)
  })

  it('shows the API error when an upload is rejected', async () => {
    seedVehicle({ make: 'Ford', model: 'Kuga', photos: [] })
    server.use(
      http.post(`${API_URL}/vehicles/:id/photos`, () =>
        HttpResponse.json(
          { error: { code: 'UNSUPPORTED_PHOTO_TYPE', message: 'Photos must be JPEG, PNG or WebP images' } },
          { status: 415 },
        ),
      ),
    )
    const { user } = renderApp({ path: '/app', user: seedUser('admin') })
    const dialog = await openEdit(user, 'Ford Kuga')

    await user.upload(within(dialog).getByLabelText(/add photos/i), photoFile())

    expect(await within(dialog).findByText(/photos must be jpeg, png or webp images/i)).toBeInTheDocument()
  })

  it('stops offering uploads once a vehicle has 10 photos', async () => {
    seedVehicle({ make: 'Ford', model: 'Kuga', photos: Array.from({ length: 10 }, fakePhoto) })
    const { user } = renderApp({ path: '/app', user: seedUser('admin') })

    const dialog = await openEdit(user, 'Ford Kuga')

    expect(within(dialog).getByText('10 of 10 photos')).toBeInTheDocument()
    expect(within(dialog).getByLabelText(/add photos/i)).toBeDisabled()
  })
})
