import { defineConfig, devices } from '@playwright/test'

import { TEST_ENV } from './e2e/test-env'

const APP_PORT = 3100
const FAKE_ORCHESTRATOR_PORT = 7790
export const APP_URL = `http://localhost:${APP_PORT}`
export const FAKE_ORCHESTRATOR_URL = `http://127.0.0.1:${FAKE_ORCHESTRATOR_PORT}`
const isCI = !!process.env.CI
// Sessão do usuário de teste, gravada pelo projeto `setup` (e2e/auth.setup.ts).
export const AUTH_STATE = 'e2e/.auth/session.json'
const CONFIG_AGENTS_SPEC = /config-crud\.agents\.spec\.ts/

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
  // P2-01: todo o app exige login. O `setup` entra uma vez pela tela e os
  // testes começam com a sessão dele.
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], storageState: AUTH_STATE },
      dependencies: ['setup'],
      testIgnore: CONFIG_AGENTS_SPEC
    },
    // P2-06: o CRUD de agents muda a config que o dashboard conta; roda depois.
    {
      name: 'config-agents',
      testMatch: CONFIG_AGENTS_SPEC,
      use: { ...devices['Desktop Chrome'], storageState: AUTH_STATE },
      dependencies: ['chromium']
    }
  ],
  webServer: [
    {
      name: 'fake-orchestrator',
      command: 'node e2e/fake-orchestrator/server.ts',
      // Sem chave o /status responde 401, que o Playwright já conta como no ar.
      url: `${FAKE_ORCHESTRATOR_URL}/status`,
      // O fake exige as mesmas chaves que o BFF manda (decisão 0018).
      env: {
        FAKE_ORCHESTRATOR_PORT: String(FAKE_ORCHESTRATOR_PORT),
        FAKE_API_KEY_RUN: TEST_ENV.ORCHESTRATOR_API_KEY_RUN,
        FAKE_API_KEY_ADMIN: TEST_ENV.ORCHESTRATOR_API_KEY_ADMIN
      },
      reuseExistingServer: !isCI
    },
    // Na CI, o build de produção: o `next dev` compila cada rota sob demanda e
    // recarrega por HMR, o que deixa a suíte instável sob carga (decisão 0013).
    // O env do servidor (src/server/env.ts) é o de teste. O timeout cobre
    // build + start.
    {
      name: 'app',
      command: isCI
        ? `pnpm exec next build && pnpm exec next start -p ${APP_PORT}`
        : `pnpm exec next dev -p ${APP_PORT}`,
      url: APP_URL,
      env: { ...TEST_ENV, NEXT_TELEMETRY_DISABLED: '1' },
      reuseExistingServer: !isCI,
      timeout: isCI ? 300_000 : 120_000
    }
  ]
})
