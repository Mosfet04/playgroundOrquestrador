import { expect, request as playwrightRequest, test } from '@playwright/test'

import { APP_URL } from '../playwright.config'
import { TEST_ENV } from './test-env'

// QA P2-02, contra o app real: o health exige sessão e nada do orquestrador
// (chave, URL, hash) aparece na resposta ou nos cabeçalhos.

const SECRETS = [
  TEST_ENV.ORCHESTRATOR_API_KEY_RUN,
  TEST_ENV.ORCHESTRATOR_API_KEY_ADMIN,
  TEST_ENV.ORCHESTRATOR_URL,
  TEST_ENV.SESSION_SECRET,
  'scrypt:'
]

test('health sem sessão ⇒ 401 JSON, sem segredo', async () => {
  const anonymous = await playwrightRequest.newContext({
    baseURL: APP_URL,
    storageState: { cookies: [], origins: [] }
  })
  const response = await anonymous.get('/api/orchestrator/health')
  const text = await response.text()
  await anonymous.dispose()

  expect(response.status()).toBe(401)
  expect(JSON.parse(text)).toEqual({ success: false, error: 'unauthorized' })
  for (const secret of SECRETS) expect(text).not.toContain(secret)
})

test('health com sessão: cabeçalhos sem segredo', async ({ request }) => {
  const response = await request.get('/api/orchestrator/health')
  const headers = JSON.stringify(response.headers())

  expect(response.status()).toBe(200)
  for (const secret of SECRETS) expect(headers).not.toContain(secret)
})
