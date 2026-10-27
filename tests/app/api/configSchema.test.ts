// @vitest-environment node
import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'

import { GET } from '@/app/api/config/schema/route'

import { TEST_ENV } from '../../../e2e/test-env'
import { server } from '../../msw/server'

// P3-01: GET /api/config/schema lê o GET /admin/schema (chave admin) e devolve
// só as opções dos formulários. A sessão é exigida pelo middleware
// (tests/middleware.test.ts). Falha vira código próprio, sem eco de nada.

const UPSTREAM = `${TEST_ENV.ORCHESTRATOR_URL}/admin/schema`
const LEAK = 'detalhe-interno-do-orquestrador'

// Documento real (config_schema.py), com chaves que o playground não usa.
const document = {
  providers: {
    chat: [
      { name: 'ollama', model_params: ['temperature', 'stop'], requires_base_url: false },
      { name: 'fake-llm', model_params: [], requires_base_url: true }
    ],
    embedder: [{ name: 'fake-embed', model_params: [], requires_base_url: false }]
  },
  agent: {
    markdown: { type: 'boolean', default: true },
    add_history_to_context: { type: 'boolean', default: true },
    add_datetime_to_context: { type: 'boolean', default: false },
    num_history_runs: { type: 'integer', default: 5, minimum: 1, maximum: 50 },
    reasoning: { type: 'boolean', default: false }
  },
  team: {
    mode: ['route', 'coordinate'],
    markdown: { type: 'boolean', default: true },
    add_history_to_context: { type: 'boolean', default: false }
  },
  tool: { http_method: ['GET', 'POST'], parameter_type: ['string', 'integer'] },
  rag_config: { search_strategy: ['semantic'] },
  api_key_ref: { formats: ['env:<NOME>', 'file:<caminho>'] },
  config_store: { writable: true }
}

describe('GET /api/config/schema', () => {
  it('devolve as opções do schema, lidas com a chave admin, sem as seções não usadas', async () => {
    let authorization: string | null = null
    server.use(
      http.get(UPSTREAM, ({ request }) => {
        authorization = request.headers.get('authorization')
        return HttpResponse.json(document)
      })
    )

    const response = await GET()

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      success: true,
      data: {
        chatProviders: [
          { name: 'ollama', modelParams: ['temperature', 'stop'], requiresBaseUrl: false },
          { name: 'fake-llm', modelParams: [], requiresBaseUrl: true }
        ],
        embedderProviders: ['fake-embed'],
        httpMethods: ['GET', 'POST'],
        parameterTypes: ['string', 'integer'],
        agent: {
          markdown: true,
          addHistoryToContext: true,
          addDatetimeToContext: false,
          reasoning: false,
          numHistoryRuns: { default: 5, minimum: 1, maximum: 50 }
        },
        team: { modes: ['route', 'coordinate'], markdown: true, addHistoryToContext: false },
        apiKeyRefFormats: ['env:<NOME>', 'file:<caminho>'],
        writable: true
      }
    })
    expect(authorization).toBe(`Bearer ${TEST_ENV.ORCHESTRATOR_API_KEY_ADMIN}`)
  })

  it('store só leitura: writable false', async () => {
    server.use(
      http.get(UPSTREAM, () =>
        HttpResponse.json({ ...document, config_store: { writable: false } })
      )
    )

    const body = await (await GET()).json()

    expect(body.data.writable).toBe(false)
  })

  it.each([
    ['sem provider de chat', { ...document, providers: { chat: 'ollama', embedder: [] } }],
    ['sem tool.http_method', { ...document, tool: { parameter_type: ['string'] } }],
    ['provider de chat sem model_params', {
      ...document,
      providers: { chat: [{ name: 'ollama', requires_base_url: false }], embedder: [] }
    }],
    ['provider de chat com requires_base_url que não é booleano', {
      ...document,
      providers: {
        chat: [{ name: 'ollama', model_params: [], requires_base_url: 'sim' }],
        embedder: []
      }
    }],
    ['sem a seção agent', { ...document, agent: undefined }],
    ['sem a seção team', { ...document, team: undefined }],
    ['team.mode vazio', { ...document, team: { ...document.team, mode: [] } }],
    ['default de team que não é booleano', {
      ...document,
      team: { ...document.team, markdown: { type: 'boolean', default: 'sim' } }
    }],
    ['num_history_runs sem faixa', {
      ...document,
      agent: { ...document.agent, num_history_runs: { type: 'integer', default: 5 } }
    }],
    ['default de campo de execução que não é booleano', {
      ...document,
      agent: { ...document.agent, markdown: { type: 'boolean', default: 'sim' } }
    }],
    ['api_key_ref.formats vazio', { ...document, api_key_ref: { formats: [] } }],
    ['api_key_ref.formats sem prefixo com ":"', { ...document, api_key_ref: { formats: ['qualquer'] } }],
    ['api_key_ref.formats que não é lista', { ...document, api_key_ref: { formats: 'env:' } }],
    ['writable que não é booleano', { ...document, config_store: { writable: 'sim' } }]
  ])('schema inválido (%s): 502 invalid_response', async (_, upstream) => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    server.use(http.get(UPSTREAM, () => HttpResponse.json(upstream)))

    const response = await GET()

    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({ success: false, error: 'invalid_response' })
  })

  it.each([
    ['fora do ar', () => HttpResponse.error(), 503, 'unreachable'],
    ['5xx', () => HttpResponse.json({ detail: LEAK }, { status: 500 }), 502, 'server_error'],
    ['chave recusada', () => HttpResponse.json({ detail: LEAK }, { status: 401 }), 502, 'unauthorized']
  ])('orquestrador %s: %i com o código, sem chave nem URL', async (_, respond, status, error) => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    server.use(http.get(UPSTREAM, respond))

    const response = await GET()
    const text = await response.text()

    expect(response.status).toBe(status)
    expect(JSON.parse(text)).toEqual({ success: false, error })
    for (const secret of [
      TEST_ENV.ORCHESTRATOR_API_KEY_RUN,
      TEST_ENV.ORCHESTRATOR_API_KEY_ADMIN,
      TEST_ENV.ORCHESTRATOR_URL,
      LEAK
    ])
      expect(text).not.toContain(secret)
  })

  it('prazo estourado (TimeoutError): 504 timeout, sem eco', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(AbortSignal, 'timeout').mockReturnValue(
      AbortSignal.abort(new DOMException('prazo', 'TimeoutError'))
    )

    const response = await GET()
    const text = await response.text()

    expect(response.status).toBe(504)
    expect(JSON.parse(text)).toEqual({ success: false, error: 'timeout' })
    expect(text).not.toContain(TEST_ENV.ORCHESTRATOR_URL)
  })
})
