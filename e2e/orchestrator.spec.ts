import { expect, test } from '@playwright/test'

import { TEST_ENV } from './test-env'

// P2-02: o BFF chega ao orquestrador (fake) pelo cliente do servidor, e a
// resposta ao browser não leva chave nem URL interna.
test('GET /api/orchestrator/health responde pelo BFF sem expor a chave', async ({
  request
}) => {
  const response = await request.get('/api/orchestrator/health')
  const text = await response.text()

  expect(response.status()).toBe(200)
  expect(JSON.parse(text)).toEqual({ success: true, data: { status: 'ok' } })
  for (const secret of [
    TEST_ENV.ORCHESTRATOR_API_KEY_RUN,
    TEST_ENV.ORCHESTRATOR_API_KEY_ADMIN,
    TEST_ENV.ORCHESTRATOR_URL
  ])
    expect(text).not.toContain(secret)
})
