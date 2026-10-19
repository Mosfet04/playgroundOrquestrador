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
  // Local (sem CI) o app roda no `next dev`, que compila cada rota e server
  // action na 1ª visita: com a suíte em paralelo, uma carga passa dos prazos
  // padrão. Só o dev ganha folga; o build da CI fica no padrão do Playwright.
  timeout: isCI ? 30_000 : 90_000,
  expect: { timeout: isCI ? 5_000 : 15_000 },
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
    // Na CI, o build de produção: o `next dev` compila cada rota sob demanda e
    // recarrega por HMR, o que deixa a suíte instável sob carga (decisão 0013).
    // O build precisa de MONGO_* no ambiente (src/lib/mongodb.ts); o timeout
    // cobre build + start.
    {
      name: 'app',
      command: isCI
        ? `pnpm exec next build && pnpm exec next start -p ${APP_PORT}`
        : `pnpm exec next dev -p ${APP_PORT}`,
      url: APP_URL,
      env: { NEXT_TELEMETRY_DISABLED: '1' },
      reuseExistingServer: !isCI,
      timeout: isCI ? 300_000 : 120_000
    }
  ]
})
