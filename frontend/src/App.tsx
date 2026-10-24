import { AppProviders } from './AppProviders'
import { createAppRouter } from './routes'

const router = createAppRouter('browser')

export default function App() {
  return <AppProviders router={router} />
}
