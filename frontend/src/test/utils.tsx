import { QueryClient } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { User } from '../api/types'
import { AppProviders } from '../AppProviders'
import { createAppRouter } from '../routes'
import { TOKEN_STORAGE_KEY } from '../auth/tokenStorage'
import { tokenFor } from './handlers'

interface Options {
  path?: string
  user?: User
  token?: string
}

export function renderApp({ path = '/', user, token }: Options = {}) {
  if (user || token) localStorage.setItem(TOKEN_STORAGE_KEY, token ?? tokenFor(user!))
  const router = createAppRouter('memory', [path])
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const result = render(<AppProviders router={router} queryClient={queryClient} />)
  return { ...result, router, user: userEvent.setup() }
}
