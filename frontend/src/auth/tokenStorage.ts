// The access token lives in localStorage so sessions survive reloads. Trade-off:
// readable by any script on the page (XSS), mitigated by React's escaping, no
// third-party scripts and a 15-minute lifetime. The long-lived refresh token is in an
// httpOnly cookie that scripts can't read. See README "Security notes".
export const TOKEN_STORAGE_KEY = 'drivestock.token'

export const tokenStorage = {
  get(): string | null {
    try {
      return localStorage.getItem(TOKEN_STORAGE_KEY)
    } catch {
      return null
    }
  },
  set(token: string) {
    try {
      localStorage.setItem(TOKEN_STORAGE_KEY, token)
    } catch {
      // Storage unavailable (private mode): session lasts for this tab only.
    }
  },
  clear() {
    try {
      localStorage.removeItem(TOKEN_STORAGE_KEY)
    } catch {
      // ignore
    }
  },
}
