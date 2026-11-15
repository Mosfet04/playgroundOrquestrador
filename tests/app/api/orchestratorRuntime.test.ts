// @vitest-environment node
import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'

import { GET } from '@/app/api/orchestrator/runtime/route'

import { TEST_ENV } from '../../../e2e/test-env'
import { server } from '../../msw/server'

// GET /api/orchestrator/runtime: a saúde do orquestrador (GET /admin/health com
// a chave admin) para o indicador da casca e a /settings (P4-05, D-P4-05-7/8).
// O 200 é `healthy`; o 503 com corpo válido é `degraded` (o orquestrador manda
// o corpo inteiro). Só status e números saem: `message` e `provider` (texto
// livre) ficam. Outra falha é mapeada como nas outras rotas, sem eco. Sessão:
// tests/middleware.test.ts.

const UPSTREAM = `${TEST_ENV.ORCHESTRATOR_URL}/admin/health`
const LEAK = 'pilha interna'
const SECRETS = [
  TEST_ENV.ORCHESTRATOR_API_KEY_RUN,
  TEST_ENV.ORCHESTRATOR_API_KEY_ADMIN,
  TEST_ENV.ORCHESTRATOR_URL,
  LEAK
]

const healthyBody = {
  status: 'healthy',
  checks: {
    mongodb: { status: 'healthy' },
    memory: { status: 'healthy', usage_percent: 42.3, available_gb: 9.12 },
    otlp: { status: 'configured', provider: LEAK }
  },
  response_time_ms: 38.5,
  runtime_revision: 7
}

const healthyData = {
  status: 'healthy',
  revision: 7,
  responseTimeMs: 38.5,
  checks: {
    database: 'healthy',
    memory: { status: 'healthy', usagePercent: 42.3, availableGb: 9.12 },
    telemetry: 'configured'
  }
}

const serve = (body: Record<string, unknown> | string, status = 200) =>
  server.use(
    http.get(UPSTREAM, () =>
      typeof body === 'string' ? new HttpResponse(body, { status }) : HttpResponse.json(body, { status })
    )
  )

const read = async () => {
  const response = await GET()
  const text = await response.text()
  for (const secret of SECRETS) expect(text).not.toContain(secret)
  return { status: response.status, body: JSON.parse(text) }
}

describe('GET /api/orchestrator/runtime', () => {
  it('200 ⇒ healthy com revisão, tempo e checks, chamado com a chave admin; o provider não sai', async () => {
    let authorization: string | null = null
    server.use(
      http.get(UPSTREAM, ({ request }) => {
        authorization = request.headers.get('authorization')
        return HttpResponse.json(healthyBody)
      })
    )

    expect(await read()).toEqual({ status: 200, body: { success: true, data: healthyData } })
    expect(authorization).toBe(`Bearer ${TEST_ENV.ORCHESTRATOR_API_KEY_ADMIN}`)
  })

  it('503 com corpo válido ⇒ 200 degraded, com os checks do corpo (falha em error)', async () => {
    serve(
      {
        status: 'unhealthy',
        checks: {
          mongodb: { status: 'unhealthy' },
          memory: { status: 'warning', usage_percent: 93.1, available_gb: 0.4 },
          otlp: { status: 'not_configured' }
        },
        response_time_ms: 2004,
        runtime_revision: 28
      },
      503
    )

    expect(await read()).toEqual({
      status: 200,
      body: {
        success: true,
        data: {
          status: 'degraded',
          revision: 28,
          responseTimeMs: 2004,
          checks: {
            database: 'error',
            memory: { status: 'warning', usagePercent: 93.1, availableGb: 0.4 },
            telemetry: 'not_configured'
          }
        }
      }
    })
  })

  it('check que estourou, ausente ou desconhecido ⇒ error; a message da memória e números inválidos não saem', async () => {
    serve(
      {
        status: 'unhealthy',
        checks: {
          mongodb: { status: 'error' },
          memory: { status: 'unavailable', message: LEAK, usage_percent: 'muito', available_gb: -1 },
          otlp: { status: 'quebrado' }
        },
        runtime_revision: 3
      },
      503
    )

    expect((await read()).body.data).toEqual({
      status: 'degraded',
      revision: 3,
      checks: { database: 'error', memory: { status: 'unavailable' }, telemetry: 'error' }
    })

    serve({ status: 'unhealthy', checks: {}, response_time_ms: 'rápido', runtime_revision: 3 }, 503)

    expect((await read()).body.data).toEqual({
      status: 'degraded',
      revision: 3,
      checks: { database: 'error', memory: { status: 'error' }, telemetry: 'error' }
    })
  })

  it.each([
    ['sem runtime_revision', { ...healthyBody, runtime_revision: undefined }],
    ['revisão negativa', { ...healthyBody, runtime_revision: -1 }],
    ['revisão fracionária', { ...healthyBody, runtime_revision: 1.5 }],
    ['revisão em texto', { ...healthyBody, runtime_revision: '7' }],
    ['sem checks', { status: 'healthy', runtime_revision: 7 }],
    ['não JSON', LEAK]
  ])('200 com corpo %s ⇒ 502 invalid_response', async (_, body) => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    serve(body)

    expect(await read()).toEqual({ status: 502, body: { success: false, error: 'invalid_response' } })
  })

  it.each([
    ['sem runtime_revision', { ...healthyBody, status: 'unhealthy', runtime_revision: undefined }],
    ['sem checks', { status: 'unhealthy', runtime_revision: 7 }],
    ['de erro genérico', { detail: LEAK }],
    ['não JSON', LEAK]
  ])('503 com corpo %s ⇒ 502 server_error', async (_, body) => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    serve(body, 503)

    expect(await read()).toEqual({ status: 502, body: { success: false, error: 'server_error' } })
  })

  it.each([
    ['fora do ar', () => HttpResponse.error(), 503, 'unreachable'],
    ['com 500', () => HttpResponse.json(healthyBody, { status: 500 }), 502, 'server_error'],
    ['com a chave recusada', () => HttpResponse.json({ detail: LEAK }, { status: 401 }), 502, 'unauthorized'],
    ['com a chave sem permissão', () => HttpResponse.json({ detail: LEAK }, { status: 403 }), 502, 'forbidden']
  ])('orquestrador %s ⇒ %i %s, sem chave, URL nem corpo', async (_, respond, status, error) => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    server.use(http.get(UPSTREAM, respond))

    expect(await read()).toEqual({ status, body: { success: false, error } })
  })

  it('prazo estourado ⇒ 504 timeout', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(AbortSignal, 'timeout').mockReturnValue(
      AbortSignal.abort(new DOMException('prazo', 'TimeoutError'))
    )
    serve(healthyBody)

    expect(await read()).toEqual({ status: 504, body: { success: false, error: 'timeout' } })
  })
})
