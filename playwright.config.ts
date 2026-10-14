import { defineConfig, devices } from '@playwright/test'

const APP_PORT = 3100
const FAKE_ORCHESTRATOR_PORT = 7790
export const APP_URL = `http://localhost:${APP_PORT}`
export const FAKE_ORCHESTRATOR_URL = `http://127.0.0.1:${FAKE_ORCHESTRATOR_PORT}`
const isCI = !!process.env.CI

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: 0,
  reporter: isCI ? 'list' : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: APP_URL,
    trace: 'retain-on-failure'
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      name: 'fake-orchestrator',
      command: 'node e2e/fake-orchestrator/server.ts',
      url: `${FAKE_ORCHESTRATOR_URL}/status`,
      env: { FAKE_ORCHESTRATOR_PORT: String(FAKE_ORCHESTRATOR_PORT) },
      reuseExistingServer: !isCI
    },
    {
      name: 'app',
      command: `pnpm exec next dev -p ${APP_PORT}`,
      url: APP_URL,
      env: { NEXT_TELEMETRY_DISABLED: '1' },
      reuseExistingServer: !isCI,
      timeout: 120_000
    }
  ]
})
