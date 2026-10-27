import '@testing-library/jest-dom/vitest'
import { cleanup, configure } from '@testing-library/react'
import { afterAll, afterEach, beforeAll } from 'vitest'
import { compareStore } from '../features/compare/compareStore'
import { resetDb } from './handlers'
import { server } from './server'

// findBy*/waitFor give up after 1s by default, which the full suite (many files in parallel)
// occasionally exceeds. Failing tests still fail; they just get a little longer.
configure({ asyncUtilTimeout: 3000 })

// jsdom has no object URLs; the photo picker uses them for local previews.
URL.createObjectURL ??= (blob: Blob) => `blob:preview-${blob.size}`
URL.revokeObjectURL ??= () => {}

// jsdom's FormData/File can't be sent through Node's fetch (the body length comes out
// wrong), so uploads are rebuilt with Node's own classes before they reach MSW. Browsers
// use their native FormData, so this only affects tests.
const NodeFormData = (await new Response(new URLSearchParams()).formData()).constructor as typeof FormData
// Read at runtime because the app's tsconfig has no Node types.
const { File: NodeFile } = (
  globalThis as unknown as { process: { getBuiltinModule(id: 'node:buffer'): { File: typeof File } } }
).process.getBuiltinModule('node:buffer')

function sendFormDataWithNodeClasses() {
  const mockedFetch = globalThis.fetch
  globalThis.fetch = async (input, init) => {
    if (init?.body instanceof FormData) {
      const body = new NodeFormData()
      for (const [key, value] of init.body) {
        if (typeof value === 'string') body.append(key, value)
        else body.append(key, new NodeFile([await value.arrayBuffer()], value.name, { type: value.type }))
      }
      init = { ...init, body }
    }
    return mockedFetch(input, init)
  }
}

beforeAll(() => {
  server.listen({ onUnhandledFrame: 'error' })
  sendFormDataWithNodeClasses()
})
afterEach(() => {
  cleanup()
  server.resetHandlers()
  resetDb()
  localStorage.clear()
  compareStore.reload()
})
afterAll(() => server.close())
