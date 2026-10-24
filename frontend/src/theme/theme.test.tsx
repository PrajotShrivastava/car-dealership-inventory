import { screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { seedUser } from '../test/handlers'
import { renderApp } from '../test/utils'
import { initialTheme, THEME_STORAGE_KEY } from './theme'

function mockSystemDark(dark: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: dark && query === '(prefers-color-scheme: dark)',
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  )
}

describe('theme toggle', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    document.documentElement.classList.remove('dark')
  })

  it('switches to dark mode and back from the app header', async () => {
    const { user } = renderApp({ path: '/', user: seedUser('customer') })

    await user.click(await screen.findByRole('button', { name: /switch to dark mode/i }))

    expect(document.documentElement).toHaveClass('dark')
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')

    await user.click(screen.getByRole('button', { name: /switch to light mode/i }))

    expect(document.documentElement).not.toHaveClass('dark')
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light')
  })

  it('is available on the sign-in page', async () => {
    renderApp({ path: '/login' })

    expect(await screen.findByRole('button', { name: /switch to dark mode/i })).toBeInTheDocument()
  })

  it('starts from the saved preference', async () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark')

    renderApp({ path: '/login' })

    expect(await screen.findByRole('button', { name: /switch to light mode/i })).toBeInTheDocument()
    expect(document.documentElement).toHaveClass('dark')
  })

  it('follows the system setting when nothing is saved', () => {
    mockSystemDark(true)
    expect(initialTheme()).toBe('dark')

    mockSystemDark(false)
    expect(initialTheme()).toBe('light')
  })

  it('a saved choice beats the system setting', () => {
    mockSystemDark(true)
    localStorage.setItem(THEME_STORAGE_KEY, 'light')

    expect(initialTheme()).toBe('light')
  })
})
