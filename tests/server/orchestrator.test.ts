// @vitest-environment node
import { delay, http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { callOrchestrator } from '@/server/orchestrator/client'

import { TEST_ENV } from '../../e2e/test-env'
import { server } from '../msw/server'

// P2-02: cliente único do orquestrador. Chave (run|admin) escolhida por
// chamada, timeout e erro mapeado para código próprio, sem eco do corpo, da
// exceção, da URL interna nem da chave.

const BASE = TEST_ENV.ORCHESTRATOR_URL
const statusSchema = z.object({ status: z.string() })
const SECRETS = [
  TEST_ENV.ORCHESTRATOR_API_KEY_RUN,
  TEST_ENV.ORCHESTRATOR_API_KEY_ADMIN,
  BASE
]
const LEAK = 'detalhe-interno-do-orquestrador'

const expectNoLeak = (value: unknown) => {
  const text = JSON.stringify(value)
  for (const secret of [...SECRETS, LEAK]) expect(text).not.toContain(secret)
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('callOrchestrator: chave por chamada', () => {
  it.each([
    ['run', TEST_ENV.ORCHESTRATOR_API_KEY_RUN],
    ['admin', TEST_ENV.ORCHESTRATOR_API_KEY_ADMIN]
  ] as const)('chave %s vai em Authorization: Bearer', async (key, value) => {
    let authorization: string | null = null
    server.use(
      http.get(`${BASE}/health`, ({ request }) => {
        authorization = request.headers.get('authorization')
        return HttpResponse.json({ status: 'ok', instantiated_at: 'x' })
      })
    )

    const result = await callOrchestrator('/health', { key, schema: statusSchema })

    expect(result).toEqual({ ok: true, data: { status: 'ok' } })
    expect(authorization).toBe(`Bearer ${value}`)
  })

  it('usa a URL do env lida na chamada, sem barra dupla', async () => {
    vi.stubEnv('ORCHESTRATOR_URL', 'http://orquestrador.interno:9000/base/')
    server.use(
      http.get('http://orquestrador.interno:9000/base/health', () =>
        HttpResponse.json({ status: 'ok' })
      )
    )

    const result = await callOrchestrator('/health', { key: 'run', schema: statusSchema })

    expect(result).toEqual({ ok: true, data: { status: 'ok' } })
  })

  it('repassa método e corpo JSON', async () => {
    let received: { method: string; body: unknown; type: string | null } | null =
      null
    server.use(
      http.post(`${BASE}/admin/config/reload`, async ({ request }) => {
        received = {
          method: request.method,
          body: await request.json(),
          type: request.headers.get('content-type')
        }
        return HttpResponse.json({ status: 'reloaded' })
      })
    )

    const result = await callOrchestrator('/admin/config/reload', {
      key: 'admin',
      method: 'POST',
      body: { motivo: 'teste' },
      schema: statusSchema
    })

    expect(result.ok).toBe(true)
    expect(received).toEqual({
      method: 'POST',
      body: { motivo: 'teste' },
      type: 'application/json'
    })
  })
})

describe('callOrchestrator: corpo vazio', () => {
  it('204 valida undefined contra o schema, sem ler JSON', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    server.use(
      http.delete(`${BASE}/sessions/s-1`, () => new HttpResponse(null, { status: 204 }))
    )

    const result = await callOrchestrator('/sessions/s-1', {
      key: 'admin',
      method: 'DELETE',
      schema: z.undefined()
    })

    expect(result).toEqual({ ok: true, data: undefined })
    expect(warn).not.toHaveBeenCalled()
  })
})

describe('callOrchestrator: path seguro', () => {
  it.each([
    '/sessions/../admin/config/agents/x',
    '/sessions/%2e%2e/admin/config/agents/x',
    '/sessions/.%2E/admin',
    '/sessions/./x',
    '/sessions/..\\admin',
    '/sessions/%5c..',
    '/sessions?type=agent',
    '/sessions#x',
    '/sessions/%E0%A4%A'
  ] as const)('recusa %s sem chamar o orquestrador', async (path) => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    let called = false
    server.use(
      http.all(`${BASE}/*`, () => {
        called = true
        return HttpResponse.json({ status: 'ok' })
      })
    )

    const result = await callOrchestrator(path, { key: 'run', schema: statusSchema })

    expect(result).toEqual({ ok: false, error: 'invalid_path' })
    expect(called).toBe(false)
  })

  it('aceita id com ponto e codificado', async () => {
    server.use(
      http.get(`${BASE}/sessions/:id`, ({ params }) =>
        HttpResponse.json({ status: String(params.id) })
      )
    )

    const result = await callOrchestrator('/sessions/v1.2%2Fx', {
      key: 'run',
      schema: statusSchema
    })

    expect(result).toEqual({ ok: true, data: { status: 'v1.2/x' } })
  })
})

describe('callOrchestrator: erro mapeado', () => {
  it.each([
    [401, 'unauthorized'],
    [403, 'forbidden'],
    [404, 'not_found'],
    [422, 'rejected'],
    [500, 'server_error'],
    [503, 'server_error']
  ])('HTTP %i ⇒ %s, sem eco do corpo', async (status, error) => {
    server.use(
      http.get(`${BASE}/health`, () =>
        HttpResponse.json({ detail: LEAK }, { status })
      )
    )

    const result = await callOrchestrator('/health', { key: 'run', schema: statusSchema })

    expect(result).toEqual({ ok: false, error, status })
    expectNoLeak(result)
  })

  it('timeout ⇒ timeout', async () => {
    server.use(
      http.get(`${BASE}/health`, async () => {
        await delay(1_000)
        return HttpResponse.json({ status: 'ok' })
      })
    )

    const result = await callOrchestrator('/health', {
      key: 'run',
      schema: statusSchema,
      timeoutMs: 20
    })

    expect(result).toEqual({ ok: false, error: 'timeout' })
  })

  it('corpo que nunca termina ⇒ timeout', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    server.use(
      http.get(`${BASE}/health`, ({ request }) => {
        // Como o fetch do Node: o abort do signal erra o corpo em leitura.
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('{"status":'))
            request.signal.addEventListener('abort', () =>
              controller.error(request.signal.reason)
            )
          }
        })
        return new HttpResponse(stream, {
          headers: { 'Content-Type': 'application/json' }
        })
      })
    )

    const result = await callOrchestrator('/health', {
      key: 'run',
      schema: statusSchema,
      timeoutMs: 50
    })

    expect(result).toEqual({ ok: false, error: 'timeout' })
  })

  it('falha de rede ⇒ unreachable, sem a exceção', async () => {
    server.use(http.get(`${BASE}/health`, () => HttpResponse.error()))

    const result = await callOrchestrator('/health', { key: 'run', schema: statusSchema })

    expect(result).toEqual({ ok: false, error: 'unreachable' })
  })

  it.each([
    ['fora do schema', () => HttpResponse.json({ estado: LEAK })],
    ['corpo que não é JSON', () => HttpResponse.text(LEAK)]
  ])('resposta %s ⇒ invalid_response, sem lançar', async (_, respond) => {
    server.use(http.get(`${BASE}/health`, respond))

    const result = await callOrchestrator('/health', { key: 'run', schema: statusSchema })

    expect(result).toEqual({ ok: false, error: 'invalid_response', status: 200 })
    expectNoLeak(result)
  })

  it('o log do erro não leva chave, URL interna nem corpo', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    server.use(
      http.get(`${BASE}/admin/health`, () =>
        HttpResponse.json({ detail: LEAK }, { status: 500 })
      )
    )

    await callOrchestrator('/admin/health', { key: 'admin', schema: statusSchema })

    expect(warn).toHaveBeenCalledTimes(1)
    expectNoLeak(warn.mock.calls)
  })
})
