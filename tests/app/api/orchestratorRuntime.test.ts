// @vitest-environment node
import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'

import { GET } from '@/app/api/orchestrator/runtime/route'

import { TEST_ENV } from '../../../e2e/test-env'
import { server } from '../../msw/server'

// P4-01: GET /api/orchestrator/runtime, a revisão do runtime em vigor para o
// indicador da casca. Lê `runtime_revision` do GET /admin/health com a chave
// admin; o resto do corpo é ignorado. Falha mapeada como nas outras rotas, sem
// eco. Sessão: tests/middleware.test.ts.

const UPSTREAM = `${TEST_ENV.ORCHESTRATOR_URL}/admin/health`
const SECRETS = [
  TEST_ENV.ORCHESTRATOR_API_KEY_RUN,
  TEST_ENV.ORCHESTRATOR_API_KEY_ADMIN,
  TEST_ENV.ORCHESTRATOR_URL,
  'pilha interna'
]

describe('GET /api/orchestrator/runtime', () => {
  it('200 com a revisão, chamado com a chave admin; os checks não saem', async () => {
    let authorization: string | null = null
    server.use(
      http.get(UPSTREAM, ({ request }) => {
        authorization = request.headers.get('authorization')
        return HttpResponse.json({ status: 'healthy', checks: { mongo: 'pilha interna' }, runtime_revision: 7 })
      })
    )

    const response = await GET()

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ success: true, data: { revision: 7 } })
    expect(authorization).toBe(`Bearer ${TEST_ENV.ORCHESTRATOR_API_KEY_ADMIN}`)
  })

  it.each([
    ['sem runtime_revision', { status: 'healthy' }],
    ['negativo', { runtime_revision: -1 }],
    ['fracionário', { runtime_revision: 1.5 }],
    ['texto', { runtime_revision: '7' }],
    ['não JSON', 'pilha interna']
  ])('corpo %s ⇒ 502 invalid_response', async (_, body) => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    server.use(
      http.get(UPSTREAM, () =>
        typeof body === 'string' ? new HttpResponse(body) : HttpResponse.json(body)
      )
    )

    const response = await GET()

    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({ success: false, error: 'invalid_response' })
  })

  it.each([
    ['fora do ar', () => HttpResponse.error(), 503, 'unreachable'],
    ['5xx (health degradado)', () => HttpResponse.json({ detail: 'pilha interna' }, { status: 503 }), 502, 'server_error'],
    ['chave recusada', () => HttpResponse.json({ detail: 'pilha interna' }, { status: 401 }), 502, 'unauthorized']
  ])('orquestrador %s ⇒ %i %s, sem chave, URL nem corpo', async (_, respond, status, error) => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    server.use(http.get(UPSTREAM, respond))

    const response = await GET()
    const text = await response.text()

    expect(response.status).toBe(status)
    expect(JSON.parse(text)).toEqual({ success: false, error })
    for (const secret of SECRETS) expect(text).not.toContain(secret)
  })

  it('prazo estourado ⇒ 504 timeout', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(AbortSignal, 'timeout').mockReturnValue(
      AbortSignal.abort(new DOMException('prazo', 'TimeoutError'))
    )
    server.use(http.get(UPSTREAM, () => HttpResponse.json({ runtime_revision: 1 })))

    const response = await GET()

    expect(response.status).toBe(504)
    expect(await response.json()).toEqual({ success: false, error: 'timeout' })
  })
})
