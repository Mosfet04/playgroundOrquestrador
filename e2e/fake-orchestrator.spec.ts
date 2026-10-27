import { expect, test } from '@playwright/test'

import { FAKE_ORCHESTRATOR_URL } from '../playwright.config'
import { TEST_ENV } from './test-env'

const bearer = (key: string) => ({ Authorization: `Bearer ${key}` })

// QA P3-05: o teste do `rag_config` cria e apaga o agent `fake-rag` no fake
// compartilhado; em paralelo com o de /admin/config/agents (que conta 3
// agents) o total virava 4 sob carga. Em série no mesmo worker, não se cruzam.
test.describe.configure({ mode: 'serial' })

// P2-03 (decisão 0018): o fake exige a chave como o orquestrador real.
test.describe('fake orchestrator: chave', () => {
  test('sem chave ou com chave errada: 401', async ({ request }) => {
    expect((await request.get(`${FAKE_ORCHESTRATOR_URL}/agents`)).status()).toBe(401)
    const wrong = await request.get(`${FAKE_ORCHESTRATOR_URL}/agents`, { headers: bearer('errada') })
    expect(wrong.status()).toBe(401)
  })

  test('chave run em rota admin: 403; a admin vale em tudo', async ({ request }) => {
    const run = bearer(TEST_ENV.ORCHESTRATOR_API_KEY_RUN)
    const admin = bearer(TEST_ENV.ORCHESTRATOR_API_KEY_ADMIN)
    for (const [method, path] of [
      ['GET', '/admin/health'],
      ['GET', '/admin/schema'],
      ['GET', '/metrics'],
      ['DELETE', '/sessions/qualquer']
    ])
      expect(
        (await request.fetch(`${FAKE_ORCHESTRATOR_URL}${path}`, { method, headers: run })).status(),
        `${method} ${path}`
      ).toBe(403)
    expect(
      (await request.delete(`${FAKE_ORCHESTRATOR_URL}/sessions/qualquer`, { headers: admin })).status()
    ).toBe(204)
    expect((await request.get(`${FAKE_ORCHESTRATOR_URL}/agents`, { headers: admin })).status()).toBe(200)
  })
})

// P3-01: /admin/schema (chave admin) com providers que a lista antiga não tinha.
test('fake orchestrator: /admin/schema com a chave admin', async ({ request }) => {
  const response = await request.get(`${FAKE_ORCHESTRATOR_URL}/admin/schema`, {
    headers: bearer(TEST_ENV.ORCHESTRATOR_API_KEY_ADMIN)
  })

  expect(response.status()).toBe(200)
  const schema = await response.json()
  expect(schema.providers.chat.map((provider: { name: string }) => provider.name)).toContain('fake-llm')
  expect(schema.config_store).toEqual({ writable: true })
  // P3-02: parâmetros por provider, URL base exigida por um deles, execução e formatos da chave.
  expect(schema.providers.chat).toContainEqual({
    name: 'fake-llm',
    model_params: ['temperature'],
    requires_base_url: true
  })
  expect(schema.agent.num_history_runs).toEqual({
    type: 'integer',
    default: 5,
    minimum: 1,
    maximum: 50
  })
  expect(schema.api_key_ref.formats).toHaveLength(2)
  // P3-05: embedders com parâmetros (um sem nenhum, um que exige URL base) e as estratégias do RAG.
  expect(schema.providers.embedder).toEqual([
    { name: 'openai', model_params: ['dimensions'], requires_base_url: false },
    { name: 'ollama', model_params: [], requires_base_url: false },
    { name: 'fake-embed', model_params: ['dimensions', 'truncate'], requires_base_url: true }
  ])
  expect(schema.rag_config).toEqual({ search_strategy: ['semantic', 'hierarchical'] })
})

// P3-05: o RAG com o documento inteiro; o 422 nomeia `rag_config.<campo>`, como o real.
test('fake orchestrator: campos novos do rag_config validados (422 rag_config.<campo>)', async ({ request }) => {
  const headers = bearer(TEST_ENV.ORCHESTRATOR_API_KEY_ADMIN)
  const url = `${FAKE_ORCHESTRATOR_URL}/admin/config/agents`
  const agent = { id: 'fake-rag', nome: 'Rag', model: 'm', factory_ia_model: 'ollama' }
  const rag = { active: true, doc_name: 'd', model: 'embed', factory_ia_model: 'openai' }

  const cases: [string, Record<string, unknown>][] = [
    ['search_strategy', { ...rag, search_strategy: 'legacy' }],
    ['model_params', { ...rag, model_params: { dimensions: { a: 1 } } }],
    ['base_url', { ...rag, base_url: 'ftp://h' }],
    ['api_key_ref', { ...rag, api_key_ref: 'sk-valor-cru' }],
    ['api_key_ref', { ...rag, api_key_ref: 'env:minuscula_key' }],
    ['model', { active: true, doc_name: 'd', factory_ia_model: 'openai', api_key_ref: 'env:EMBED_API_KEY' }],
    ['factory_ia_model', { active: true, doc_name: 'd', model: 'embed', base_url: 'http://h/v1' }]
  ]
  for (const [field, rag_config] of cases) {
    const refused = await request.post(url, { headers, data: { ...agent, rag_config } })
    expect(refused.status(), `${field} ${JSON.stringify(rag_config)}`).toBe(422)
    expect(await refused.json()).toMatchObject({ field: `rag_config.${field}` })
  }

  const full = {
    ...rag,
    search_strategy: 'hierarchical',
    model_params: { dimensions: 512 },
    base_url: 'http://embed.local:8080/v1',
    api_key_ref: 'env:EMBED_API_KEY'
  }
  const ok = await request.post(url, { headers, data: { ...agent, rag_config: full } })
  expect(ok.status()).toBe(201)
  expect((await ok.json()).rag_config).toEqual(full)
  await request.delete(`${url}/fake-rag?hard=true`, { headers: { ...headers, 'If-Match': '"1"' } })
})

// P2-05: /metrics (filtrado por starting_date) e /admin/config/agents (paginado).
test('fake orchestrator: métricas e config dos agents (chave admin)', async ({ request }) => {
  const headers = bearer(TEST_ENV.ORCHESTRATOR_API_KEY_ADMIN)
  const today = new Date().toISOString().slice(0, 10)

  // Só leitura de agregados: o refresh (admin) é que inclui o dia de hoje.
  const run = bearer(TEST_ENV.ORCHESTRATOR_API_KEY_RUN)
  expect((await request.post(`${FAKE_ORCHESTRATOR_URL}/metrics/refresh`, { headers: run })).status()).toBe(403)
  expect((await request.post(`${FAKE_ORCHESTRATOR_URL}/metrics/refresh`, { headers })).status()).toBe(200)

  const metrics = await request.get(`${FAKE_ORCHESTRATOR_URL}/metrics?starting_date=${today}`, { headers })
  expect((await metrics.json()).metrics).toEqual([
    expect.objectContaining({ agent_sessions_count: 3, team_sessions_count: 1, users_count: 3 })
  ])
  const all = await request.get(`${FAKE_ORCHESTRATOR_URL}/metrics`, { headers })
  expect((await all.json()).metrics).toHaveLength(90)

  const page = await request.get(`${FAKE_ORCHESTRATOR_URL}/admin/config/agents?offset=2&limit=5`, { headers })
  expect(await page.json()).toEqual(
    expect.objectContaining({ items: [expect.objectContaining({ active: false })], total: 3, offset: 2 })
  )
})

test.describe('fake orchestrator', () => {
  test.use({ extraHTTPHeaders: bearer(TEST_ENV.ORCHESTRATOR_API_KEY_RUN) })

  test('responde às rotas conhecidas', async ({ request }) => {
    const status = await request.get(`${FAKE_ORCHESTRATOR_URL}/status`)
    expect(status.status()).toBe(200)

    const agents = await request.get(`${FAKE_ORCHESTRATOR_URL}/agents`)
    expect(agents.status()).toBe(200)
    expect(await agents.json()).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'agente-alfa' })])
    )
  })

  for (const [method, path] of [
    ['GET', '/rota-inexistente'],
    ['GET', '/playground/status'],
    ['DELETE', '/agents'],
    ['POST', '/agents/agente-inexistente/runs'],
    ['POST', '/teams/time-inexistente/runs'],
    // método errado em rota conhecida e forma diferente da rota de run
    ['POST', '/status'],
    ['POST', '/agents/agente-alfa/runs/'],
    ['POST', '/agents/agente-alfa/runs/extra']
  ]) {
    test(`responde 404 para ${method} ${path}`, async ({ request }) => {
      const response = await request.fetch(`${FAKE_ORCHESTRATOR_URL}${path}`, {
        method
      })
      expect(response.status()).toBe(404)
    })
  }

  test('lista o team do fake e sessões vazias para time desconhecido', async ({ request }) => {
    const teams = await request.get(`${FAKE_ORCHESTRATOR_URL}/teams`)
    expect(teams.status()).toBe(200)
    expect(await teams.json()).toEqual([expect.objectContaining({ id: 'time-suporte' })])

    const sessions = await request.get(
      `${FAKE_ORCHESTRATOR_URL}/sessions?type=team&component_id=qualquer`
    )
    expect(sessions.status()).toBe(200)
    expect((await sessions.json()).data).toEqual([])
  })

  test('run em stream SSE: eventos na ordem, deltas e sessão registrada', async ({
    request
  }) => {
    const sessionId = `qa-${Date.now()}-${Math.random()}`
    const response = await request.post(
      `${FAKE_ORCHESTRATOR_URL}/agents/agente-beta/runs`,
      { multipart: { message: 'ping', session_id: sessionId, stream: 'true' } }
    )
    expect(response.status()).toBe(200)
    expect(response.headers()['content-type']).toContain('text/event-stream')

    const blocks = (await response.text()).trim().split('\n\n')
    const events = blocks.map((block) => {
      const [eventLine, dataLine] = block.split('\n')
      return {
        name: eventLine.replace('event: ', ''),
        data: JSON.parse(dataLine.replace('data: ', ''))
      }
    })
    // P1-06: uma tool ok e uma com erro (a 2ª antes do último delta) e as
    // métricas do RunCompleted, nos campos do agno 2.5.
    expect(events.map((e) => e.name)).toEqual([
      'RunStarted',
      'ToolCallStarted',
      'ToolCallCompleted',
      'RunContent',
      'RunContent',
      'ToolCallStarted',
      'ToolCallCompleted',
      'RunContent',
      'RunCompleted'
    ])
    const completed = events.filter((e) => e.name === 'ToolCallCompleted')
    expect(completed.map((e) => e.data.tool)).toEqual([
      expect.objectContaining({
        tool_name: 'consultar_pedido',
        tool_call_error: false,
        metrics: { duration: 0.18 }
      }),
      expect.objectContaining({ tool_name: 'abrir_troca', tool_call_error: true })
    ])
    expect(events.at(-1)?.data.metrics).toMatchObject({
      duration: 1.4,
      input_tokens: 600,
      output_tokens: 212
    })
    for (const e of events) {
      expect(e.data.event).toBe(e.name)
      expect(e.data.session_id).toBe(sessionId)
    }
    const deltas = events
      .filter((e) => e.name === 'RunContent')
      .map((e) => e.data.content)
    expect(deltas.join('')).toBe('Agente Beta recebeu: ping')
    expect(events.at(-1)?.data.content).toBe('Agente Beta recebeu: ping')

    const sessions = await request.get(
      `${FAKE_ORCHESTRATOR_URL}/sessions?type=agent&component_id=agente-beta`
    )
    const { data } = await sessions.json()
    expect(data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ session_id: sessionId, session_name: 'ping' })
      ])
    )
    // a sessão não vaza para outro agente
    const other = await request.get(
      `${FAKE_ORCHESTRATOR_URL}/sessions?type=agent&component_id=agente-alfa`
    )
    expect(JSON.stringify(await other.json())).not.toContain(sessionId)
  })

  test('reusar o session_id não duplica a sessão', async ({ request }) => {
    const sessionId = `qa-dup-${Date.now()}-${Math.random()}`
    for (const message of ['um', 'dois']) {
      const r = await request.post(
        `${FAKE_ORCHESTRATOR_URL}/agents/agente-alfa/runs`,
        { multipart: { message, session_id: sessionId } }
      )
      await r.text()
    }
    const sessions = await request.get(
      `${FAKE_ORCHESTRATOR_URL}/sessions?type=agent&component_id=agente-alfa`
    )
    const { data } = await sessions.json()
    expect(
      data.filter((s: { session_id: string }) => s.session_id === sessionId)
    ).toHaveLength(1)
  })
})

// P2-06 (review R5): a máscara `***` só mantém o header na mesma origem, com a
// porta como escrita (o real compara o urlsplit: `https://h` ≠ `https://h:443`).
test('fake orchestrator: header mascarado só vale na mesma origem, porta explícita inclusive', async ({
  request
}) => {
  const headers = bearer(TEST_ENV.ORCHESTRATOR_API_KEY_ADMIN)
  const url = `${FAKE_ORCHESTRATOR_URL}/admin/config/tools`
  const tool = {
    id: 'fake-origem',
    name: 'Origem',
    description: 'Máscara e origem',
    route: 'https://h.example/v1',
    http_method: 'GET',
    parameters: [],
    headers: { 'X-Conta': 'texto' }
  }
  expect((await request.post(url, { headers, data: tool })).status()).toBe(201)
  const put = (route: string, version: number) =>
    request.put(`${url}/fake-origem`, {
      headers: { ...headers, 'If-Match': `"${version}"` },
      data: { ...tool, route, headers: { 'X-Conta': '***' } }
    })

  expect((await put('https://h.example/v2', 1)).status()).toBe(200)
  const otherPort = await put('https://h.example:443/v2', 2)
  expect(otherPort.status()).toBe(422)
  expect(await otherPort.json()).toMatchObject({ field: 'headers' })

  await request.delete(`${url}/fake-origem?hard=true`, { headers: { ...headers, 'If-Match': '"2"' } })
})

// P3-03: placeholder só no caminho e na query; no host (ou na porta) o real
// recusa com 422 `route`.
test('fake orchestrator: placeholder no host da route ⇒ 422 route', async ({ request }) => {
  const headers = bearer(TEST_ENV.ORCHESTRATOR_API_KEY_ADMIN)
  const url = `${FAKE_ORCHESTRATOR_URL}/admin/config/tools`
  const tool = {
    id: 'fake-host',
    name: 'Host',
    description: 'Placeholder no host',
    http_method: 'GET',
    parameters: [{ name: 'x', type: 'string', description: 'X', required: true }]
  }

  for (const route of ['https://{x}.example/v1', 'https://h.example:{x}/v1', 'https://u:p@{x}/v1']) {
    const refused = await request.post(url, { headers, data: { ...tool, route } })
    expect(refused.status(), route).toBe(422)
    expect(await refused.json()).toMatchObject({ field: 'route' })
  }
  for (const route of ['https://h.example/v1/{x}', 'https://h.example/v1?q={x}']) {
    const ok = await request.post(url, { headers, data: { ...tool, route } })
    expect(ok.status(), route).toBe(201)
    await request.delete(`${url}/fake-host?hard=true`, { headers: { ...headers, 'If-Match': '"1"' } })
  }
})
