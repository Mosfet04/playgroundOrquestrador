// @vitest-environment node
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { callOrchestrator } from '@/server/orchestrator/client'

import { TEST_ENV } from '../../e2e/test-env'
import { server } from '../msw/server'

// QA P2-02. Complementa tests/server/orchestrator.test.ts: chave run x admin
// nunca trocadas, path com %2F no segmento (comportamento documentado),
// 204/corpo vazio contra schema de objeto, exceção do fetch com segredo na
// mensagem, redirect sem a chave e env inválido.

const BASE = TEST_ENV.ORCHESTRATOR_URL
const RUN = TEST_ENV.ORCHESTRATOR_API_KEY_RUN
const ADMIN = TEST_ENV.ORCHESTRATOR_API_KEY_ADMIN
const statusSchema = z.object({ status: z.string() })

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('QA: chave run e admin nunca trocadas', () => {
  it.each([
    ['run', RUN, ADMIN],
    ['admin', ADMIN, RUN]
  ] as const)('key=%s manda só a sua chave', async (key, sent, other) => {
    let headers: Headers | null = null
    server.use(
      http.get(`${BASE}/health`, ({ request }) => {
        headers = request.headers
        return HttpResponse.json({ status: 'ok' })
      })
    )

    await callOrchestrator('/health', { key, schema: statusSchema })

    expect(headers!.get('authorization')).toBe(`Bearer ${sent}`)
    expect(headers!.get('x-api-key')).toBeNull()
    expect([...headers!.values()].join('\n')).not.toContain(other)
  })

  it('o caminho não decide a chave: /admin com key=run segue com a run', async () => {
    let authorization: string | null = null
    server.use(
      http.get(`${BASE}/admin/config/agents`, ({ request }) => {
        authorization = request.headers.get('authorization')
        return HttpResponse.json({ detail: 'forbidden' }, { status: 403 })
      })
    )

    const result = await callOrchestrator('/admin/config/agents', {
      key: 'run',
      schema: statusSchema
    })

    expect(authorization).toBe(`Bearer ${RUN}`)
    expect(result).toEqual({ ok: false, error: 'forbidden', status: 403 })
  })
})

// `%2F` dentro de um segmento: o parser WHATWG não o decodifica, mas o uvicorn
// (ou um proxy que normaliza) decodifica o path INTEIRO, e `/sessions/..%2Fadmin`
// viraria `/sessions/../admin`. Desde a review do P2-03 o isSafePath recusa.
describe('QA: %2F dentro do segmento', () => {
  it('/sessions/..%2Fadmin ⇒ invalid_path, sem sair', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    let called = false
    server.use(
      http.all(`${BASE}/*`, () => {
        called = true
        return HttpResponse.json({ status: 'ok' })
      })
    )

    const result = await callOrchestrator('/sessions/..%2Fadmin', {
      key: 'run',
      schema: statusSchema
    })

    expect(result).toEqual({ ok: false, error: 'invalid_path' })
    expect(called).toBe(false)
  })
})

describe('QA: corpo vazio contra schema de objeto', () => {
  it('204 ⇒ invalid_response, não lança', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    server.use(
      http.get(`${BASE}/health`, () => new HttpResponse(null, { status: 204 }))
    )

    const result = await callOrchestrator('/health', {
      key: 'run',
      schema: statusSchema
    })

    expect(result).toEqual({
      ok: false,
      error: 'invalid_response',
      status: 204
    })
  })
})

describe('QA: falhas de rede e redirect', () => {
  it('exceção do fetch com chave e URL na mensagem ⇒ unreachable, resultado e log limpos', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(
      new TypeError(`connect ECONNREFUSED ${BASE} Bearer ${RUN} ${ADMIN}`)
    )

    const result = await callOrchestrator('/health', {
      key: 'admin',
      schema: statusSchema
    })

    expect(result).toEqual({ ok: false, error: 'unreachable' })
    const text = JSON.stringify([result, warn.mock.calls])
    for (const secret of [RUN, ADMIN, BASE]) expect(text).not.toContain(secret)
  })

  // Verificado com o espelho do undici no MSW (fetch real do Node tira o
  // Authorization em redirect cross-origin).
  it('3xx para outro host não leva a chave ao destino', async () => {
    let firstHop: string | null = null
    let secondHop: string | null | undefined
    server.use(
      http.get(`${BASE}/health`, ({ request }) => {
        firstHop = request.headers.get('authorization')
        return HttpResponse.redirect('http://evil.test/captura', 302)
      }),
      http.get('http://evil.test/captura', ({ request }) => {
        secondHop = request.headers.get('authorization')
        return HttpResponse.json({ status: 'ok' })
      })
    )

    await callOrchestrator('/health', { key: 'admin', schema: statusSchema })

    expect(firstHop).toBe(`Bearer ${ADMIN}`)
    expect(secondHop).toBeNull()
  })
})

describe('QA: env inválido', () => {
  it('chave ausente: o erro cita só o nome da variável', async () => {
    vi.stubEnv('ORCHESTRATOR_API_KEY_ADMIN', '')

    // Como o BFF trata a falta de env: não testado aqui (P2-03).
    await expect(
      callOrchestrator('/health', { key: 'admin', schema: statusSchema })
    ).rejects.toThrow(/ORCHESTRATOR_API_KEY_ADMIN/)
  })
})
