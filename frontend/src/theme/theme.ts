export type Theme = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'drivestock.theme'

/** Saved choice first, otherwise the operating system's preference. */
export function initialTheme(): Theme {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY)
    if (saved === 'light' || saved === 'dark') return saved
  } catch {
    // storage unavailable: fall through to the system setting
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark')
  document.documentElement.style.colorScheme = theme
}

export function saveTheme(theme: Theme) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    // per-viewer convenience only
  }
}
