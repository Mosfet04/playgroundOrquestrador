// @vitest-environment node
import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'

import { POST } from '@/app/api/config/reload/route'

import { TEST_ENV } from '../../../e2e/test-env'
import { server } from '../../msw/server'

// QA P4-05: o reload não mapeia erro no orquestrador; recusas 4xx que o dev
// não cobriu (404 sem a rota, 409, 422 com o detalhe de campo) viram só o
// código, sem eco do corpo.

const LEAK = 'LEAK-detalhe-interno'

describe('QA: POST /api/config/reload, recusas 4xx', () => {
  it.each([
    [404, 404, 'not_found', { detail: LEAK }],
    [409, 502, 'rejected', { detail: LEAK }],
    [422, 502, 'rejected', { detail: [{ loc: ['body', LEAK], msg: LEAK, type: LEAK }] }]
  ])('%i ⇒ %i %s, sem o corpo', async (upstream, status, error, body) => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    server.use(
      http.post(`${TEST_ENV.ORCHESTRATOR_URL}/admin/config/reload`, () =>
        HttpResponse.json(body, { status: upstream })
      )
    )

    const response = await POST()
    const text = await response.text()

    expect(text).not.toContain(LEAK)
    expect({ status: response.status, body: JSON.parse(text) }).toEqual({
      status,
      body: { success: false, error }
    })
  })
})
