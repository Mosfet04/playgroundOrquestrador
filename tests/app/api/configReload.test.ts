// @vitest-environment node
import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'

import { POST } from '@/app/api/config/reload/route'

import { TEST_ENV } from '../../../e2e/test-env'
import { server } from '../../msw/server'

// POST /api/config/reload (P4-05, D-P4-05-3/6/10): POST /admin/config/reload
// com a chave admin relê o store e troca o runtime. 200 ⇒ a revisão nova; sem
// ela, não há o que confirmar (502 invalid_response); 5xx ⇒ 502 not_confirmed
// (o orquestrador não diz o que houve, e o runtime anterior segue); rede e
// prazo ⇒ 503/504. Sessão e Origin: tests/middleware.test.ts.

const UPSTREAM = `${TEST_ENV.ORCHESTRATOR_URL}/admin/config/reload`
const LEAK = 'pilha interna'
const SECRETS = [
  TEST_ENV.ORCHESTRATOR_API_KEY_RUN,
  TEST_ENV.ORCHESTRATOR_API_KEY_ADMIN,
  TEST_ENV.ORCHESTRATOR_URL,
  LEAK
]

const reload = async () => {
  const response = await POST()
  const text = await response.text()
  for (const secret of SECRETS) expect(text).not.toContain(secret)
  return { status: response.status, body: JSON.parse(text) }
}

describe('POST /api/config/reload', () => {
  it('200 ⇒ a revisão nova em runtimeRevision, com a chave admin e sem corpo', async () => {
    let seen: { authorization: string | null; method: string; body: string } | null = null
    server.use(
      http.post(UPSTREAM, async ({ request }) => {
        seen = {
          authorization: request.headers.get('authorization'),
          method: request.method,
          body: await request.text()
        }
        return HttpResponse.json({ runtime_revision: 29 })
      })
    )

    expect(await reload()).toEqual({ status: 200, body: { success: true, runtimeRevision: 29 } })
    expect(seen).toEqual({
      authorization: `Bearer ${TEST_ENV.ORCHESTRATOR_API_KEY_ADMIN}`,
      method: 'POST',
      body: ''
    })
  })

  it.each([
    ['sem runtime_revision', {}],
    ['com revisão negativa', { runtime_revision: -1 }],
    ['com revisão em texto', { runtime_revision: '29' }],
    ['que não é JSON', LEAK]
  ])('200 %s ⇒ 502 invalid_response', async (_, body) => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    server.use(
      http.post(UPSTREAM, () =>
        typeof body === 'string' ? new HttpResponse(body) : HttpResponse.json(body)
      )
    )

    expect(await reload()).toEqual({ status: 502, body: { success: false, error: 'invalid_response' } })
  })

  it.each([
    ['500 (não montou; o runtime anterior segue)', 500],
    ['503 (administração indisponível)', 503]
  ])('%s ⇒ 502 not_confirmed', async (_, status) => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    server.use(http.post(UPSTREAM, () => HttpResponse.json({ detail: LEAK }, { status })))

    expect(await reload()).toEqual({ status: 502, body: { success: false, error: 'not_confirmed' } })
  })

  it.each([
    ['fora do ar', () => HttpResponse.error(), 503, 'unreachable'],
    ['com a chave recusada', () => HttpResponse.json({ detail: LEAK }, { status: 401 }), 502, 'unauthorized'],
    ['com a chave sem permissão', () => HttpResponse.json({ detail: LEAK }, { status: 403 }), 502, 'forbidden']
  ])('orquestrador %s ⇒ %i %s', async (_, respond, status, error) => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    server.use(http.post(UPSTREAM, respond))

    expect(await reload()).toEqual({ status, body: { success: false, error } })
  })

  it('prazo estourado ⇒ 504 timeout', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(AbortSignal, 'timeout').mockReturnValue(
      AbortSignal.abort(new DOMException('prazo', 'TimeoutError'))
    )
    server.use(http.post(UPSTREAM, () => HttpResponse.json({ runtime_revision: 1 })))

    expect(await reload()).toEqual({ status: 504, body: { success: false, error: 'timeout' } })
  })
})
