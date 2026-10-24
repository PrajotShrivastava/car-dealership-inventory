import { readFileSync } from 'node:fs'
import { defineConfig, devices } from '@playwright/test'

// End-to-end tests run the real API against the isolated *_test database.
function backendEnv(key: string): string {
  if (process.env[key]) return process.env[key]!
  const line = readFileSync('../backend/.env', 'utf8')
    .split('\n')
    .find((l) => l.startsWith(`${key}=`))
  if (!line) throw new Error(`${key} missing from backend/.env`)
  return line.slice(key.length + 1).trim()
}

const API_PORT = 8001
const WEB_PORT = 5174
const testDb = backendEnv('TEST_DATABASE_URL')

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
  webServer: [
    {
      command: `.venv/bin/python scripts/prepare_e2e_db.py && .venv/bin/uvicorn app.main:app --port ${API_PORT}`,
      cwd: '../backend',
      url: `http://localhost:${API_PORT}/api/health`,
      env: { DATABASE_URL: testDb, CORS_ORIGINS: `http://localhost:${WEB_PORT}` },
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: `npx vite --port ${WEB_PORT} --strictPort`,
      url: `http://localhost:${WEB_PORT}`,
      env: { VITE_API_URL: `http://localhost:${API_PORT}/api` },
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
})
