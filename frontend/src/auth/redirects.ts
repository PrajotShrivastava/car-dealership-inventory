import type { Location } from 'react-router'

/** Where to go after signing in/up: the app URL originally requested, else /app. */
export function postAuthTarget(location: Location): string {
  const from = (location.state as { from?: string } | null)?.from
  return from?.startsWith('/app') ? from : '/app'
}
