import { expect, test, type APIRequestContext } from '@playwright/test'

import { APP_URL, FAKE_ORCHESTRATOR_URL } from '../playwright.config'
import { TEST_ENV } from './test-env'

// QA do P4-04, só o que os testes do BFF (handlers chamados direto) não veem: o
// roteamento real do Next com id hostil no path e restaurar a versão atual
// pela API sem passar pela tela. Sessão e Origin: tests/middleware.test.ts.

const admin = { Authorization: `Bearer ${TEST_ENV.ORCHESTRATOR_API_KEY_ADMIN}` }
const TOOLS = `${FAKE_ORCHESTRATOR_URL}/admin/config/tools`

const toolDoc = (id: string, name: string) => ({
  id,
  name,
  description: 'QA histórico',
  route: 'https://historico.example/v1',
  http_method: 'GET',
  parameters: [],
  headers: {}
})

async function seedTool(request: APIRequestContext, id: string) {
  expect((await request.post(TOOLS, { headers: admin, data: toolDoc(id, 'QA v1') })).status()).toBe(201)
  const put = await request.put(`${TOOLS}/${id}`, {
    headers: { ...admin, 'If-Match': '"1"' },
    data: toolDoc(id, 'QA v2')
  })
  expect(put.status()).toBe(200)
}

async function removeTool(request: APIRequestContext, id: string) {
  const current = await request.get(`${TOOLS}/${id}`, { headers: admin })
  if (!current.ok()) return
  const { version } = await current.json()
  await request.delete(`${TOOLS}/${id}?hard=true`, { headers: { ...admin, 'If-Match': `"${version}"` } })
}

test('id hostil no path real: nunca 5xx, nunca o detalhe interno', async ({ page }) => {
  for (const kind of ['agents', 'teams', 'tools']) {
    for (const raw of ['a%2Fb', '..%2F..%2Fadmin', '%252e%252e', 'caf%C3%A9', 'a%2541', 'x%3Fadmin%3D1', 'x%5Cy', '%00']) {
      const response = await page.request.get(`/api/${kind}/${raw}/history`)
      const text = await response.text()
      expect(response.status(), `${kind}/${raw}`).toBeLessThan(500)
      expect([200, 400, 404], `${kind}/${raw}`).toContain(response.status())
      expect(text, `${kind}/${raw}`).not.toMatch(/detail|Traceback|admin\/config/)
    }
  }
  // Unicode é um id como outro qualquer: o histórico é vazio, não um erro.
  const unicode = await page.request.get('/api/agents/caf%C3%A9/history')
  expect(await unicode.json()).toMatchObject({ success: true, data: { items: [], total: 0 } })
})

test('restaurar a versão atual pela API: o orquestrador grava a v3 igual à v2 (a tela esconde o botão, a API não)', async ({
  page,
  request
}) => {
  // O diário do fake vale para o processo todo e acumula: id novo a cada execução.
  const id = `qa-historico-api-${Date.now().toString(36)}`
  try {
    await seedTool(request, id)
    const same = await page.request.post(`/api/tools/${id}/history/2/restore`, {
      headers: { Origin: APP_URL, 'If-Match': '"2"' }
    })
    expect(same.status()).toBe(200)
    expect(await same.json()).toMatchObject({ success: true, data: { id, name: 'QA v2', version: 3 } })
    const history = await (await page.request.get(`/api/tools/${id}/history`)).json()
    expect(history.data.total).toBe(3)
    expect(history.data.items.map((item: { version: number }) => item.version)).toEqual([3, 2, 1])
  } finally {
    await removeTool(request, id)
  }
})
