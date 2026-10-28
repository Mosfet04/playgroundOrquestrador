// @vitest-environment node
import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'

import { GET } from '@/app/api/orchestrator/health/route'

import { TEST_ENV } from '../../../e2e/test-env'
import { server } from '../../msw/server'

// P2-02: GET /api/orchestrator/health, o consumidor do cliente do orquestrador
// (a sessão é exigida pelo middleware). Chama o GET /health do AgentOS com a
// chave run; falha vira 503 com o código, sem eco de nada do orquestrador.

const UPSTREAM = `${TEST_ENV.ORCHESTRATOR_URL}/health`

describe('GET /api/orchestrator/health', () => {
  it('orquestrador ok: 200 com o status, chamado com a chave run', async () => {
    let authorization: string | null = null
    server.use(
      http.get(UPSTREAM, ({ request }) => {
        authorization = request.headers.get('authorization')
        return HttpResponse.json({ status: 'ok', instantiated_at: '2026-10-22T00:00:00Z' })
      })
    )

    const response = await GET()

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ success: true, data: { status: 'ok' } })
    expect(authorization).toBe(`Bearer ${TEST_ENV.ORCHESTRATOR_API_KEY_RUN}`)
  })

  it.each([
    ['5xx', () => HttpResponse.json({ detail: 'pilha interna' }, { status: 500 }), 'server_error'],
    ['401', () => HttpResponse.json({ detail: 'unauthorized' }, { status: 401 }), 'unauthorized'],
    ['fora do schema', () => HttpResponse.json({ estado: 'ok' }), 'invalid_response'],
    ['fora do ar', () => HttpResponse.error(), 'unreachable']
  ])('orquestrador %s: 503 com o código, sem chave nem URL', async (_, respond, error) => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    server.use(http.get(UPSTREAM, respond))

    const response = await GET()
    const text = await response.text()

    expect(response.status).toBe(503)
    expect(JSON.parse(text)).toEqual({ success: false, error })
    for (const secret of [
      TEST_ENV.ORCHESTRATOR_API_KEY_RUN,
      TEST_ENV.ORCHESTRATOR_API_KEY_ADMIN,
      TEST_ENV.ORCHESTRATOR_URL,
      'pilha interna'
    ])
      expect(text).not.toContain(secret)
  })
})
