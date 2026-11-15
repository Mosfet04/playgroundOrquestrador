// @vitest-environment node
import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { callOrchestrator } from '@/server/orchestrator/client'

import { TEST_ENV } from '../../e2e/test-env'
import { server } from '../msw/server'

// QA P4-05 (D-P4-05-9): `acceptStatus` só vale para o status listado e só nas
// chamadas que o pedem. Sem a opção, o 503 com corpo válido segue falha e o
// resultado do 2xx não ganha `status`; com a opção, os outros status (500, 401,
// 404, 400) seguem como antes, e o 2xx com corpo inválido segue `invalid_response`.

const URL = `${TEST_ENV.ORCHESTRATOR_URL}/admin/health`
const schema = z.object({ runtime_revision: z.number() })
const valid = { runtime_revision: 4 }

const serve = (body: unknown, status = 200) =>
  server.use(http.get(URL, () => HttpResponse.json(body as Record<string, unknown>, { status })))

const call = (acceptStatus?: number[]) => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  return callOrchestrator('/admin/health', { key: 'admin', schema, acceptStatus })
}

describe('QA: acceptStatus', () => {
  it('sem a opção: o 2xx não traz `status` e o 503 com corpo válido é falha', async () => {
    serve(valid)
    const success = await call()
    expect(success).toEqual({ ok: true, data: valid })
    expect(success).not.toHaveProperty('status')

    serve(valid, 503)
    expect(await call()).toMatchObject({ ok: false, error: 'server_error', status: 503 })
  })

  it.each([
    ['500 com corpo válido', 500, valid, 'server_error'],
    ['401', 401, { detail: 'x' }, 'unauthorized'],
    ['404', 404, valid, 'not_found'],
    ['400 com corpo válido', 400, valid, 'rejected']
  ])('com [503]: %s segue falha', async (_, status, body, error) => {
    serve(body, status)

    expect(await call([503])).toMatchObject({ ok: false, error, status })
  })

  it('com [503]: o 200 traz status 200, o 503 traz 503, e o 200 de corpo inválido é invalid_response', async () => {
    serve(valid)
    expect(await call([503])).toEqual({ ok: true, data: valid, status: 200 })

    serve(valid, 503)
    expect(await call([503])).toEqual({ ok: true, data: valid, status: 503 })

    serve({ runtime_revision: 'x' })
    expect(await call([503])).toMatchObject({ ok: false, error: 'invalid_response', status: 200 })
  })
})
