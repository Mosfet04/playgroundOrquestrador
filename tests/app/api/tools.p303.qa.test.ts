// @vitest-environment node
// QA P3-03: corpo hostil com `default_value` e headers que o teste do dev não
// cobre (chave `__proto__`/operador dentro do valor, erro do orquestrador com o
// valor do header, upstream fora do ar).
import { http, HttpResponse } from 'msw'
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { PUT } from '@/app/api/tools/[id]/route'
import { POST } from '@/app/api/tools/route'

import { TEST_ENV } from '../../../e2e/test-env'
import { server } from '../../msw/server'

const BASE = TEST_ENV.ORCHESTRATOR_URL
const SECRET = 'Bearer qa-segredo-do-header-77'

const tool = {
  id: 'clima',
  name: 'Clima',
  description: 'Consulta a previsão do tempo',
  route: 'https://clima.example.com/v1/previsao',
  http_method: 'GET',
  headers: {},
  parameters: [{ name: 'f', type: 'object', description: 'Filtro', required: false }],
  active: true
}

const raw = (url: string, method: string, body: string, headers: Record<string, string> = {}) =>
  new NextRequest(url, { method, headers: { 'Content-Type': 'application/json', ...headers }, body })

let forwarded: string[] = []
let logged: unknown[][] = []

beforeEach(() => {
  forwarded = []
  logged = []
  for (const method of ['log', 'warn', 'error', 'info'] as const)
    vi.spyOn(console, method).mockImplementation((...args) => void logged.push(args))
})

describe('default_value e headers hostis', () => {
  it('`__proto__` e operadores dentro do default_value e do nome do header seguem como dado, sem poluir o protótipo', async () => {
    server.use(
      http.post(`${BASE}/admin/config/tools`, async ({ request }) => {
        forwarded.push(await request.text())
        return HttpResponse.json({ detail: 'x' }, { status: 500 })
      })
    )
    const body =
      '{"id":"clima","name":"Clima","description":"d","route":"https://clima.example.com/v1/p",' +
      '"headers":{"__proto__":"env:A","X-Conta":"env:B"},' +
      '"parameters":[{"name":"f","type":"object","description":"Filtro","required":false,' +
      '"default_value":{"__proto__":{"polluted":true},"$where":"1==1"}}]}'

    await POST(raw('http://playground.test/api/tools', 'POST', body))

    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
    expect(Object.prototype.hasOwnProperty.call(Object.prototype, 'polluted')).toBe(false)
    expect(forwarded).toHaveLength(1)
    // Foi como dado em JSON, nunca como protótipo.
    for (const sent of forwarded) {
      const parsed = JSON.parse(sent)
      expect(Object.getPrototypeOf(parsed.headers)).toBe(Object.prototype)
      expect(parsed.headers['X-Conta']).toBe('env:B')
    }
  })

  it('PUT: erro 5xx e upstream fora do ar não devolvem nem logam o valor do header', async () => {
    const withSecret = { ...tool, headers: { 'X-Conta': SECRET } }
    for (const respond of [
      () => HttpResponse.json({ detail: `eco ${SECRET}` }, { status: 500 }),
      () => HttpResponse.text(`eco ${SECRET}`, { status: 502 }),
      () => HttpResponse.error()
    ]) {
      server.use(http.put(`${BASE}/admin/config/tools/clima`, respond))

      const response = await PUT(
        raw('http://playground.test/api/tools/clima', 'PUT', JSON.stringify(withSecret), { 'If-Match': '"1"' }),
        { params: Promise.resolve({ id: 'clima' }) }
      )

      expect(response.status).toBeGreaterThanOrEqual(400)
      expect(await response.text()).not.toContain(SECRET)
    }
    expect(JSON.stringify(logged)).not.toContain(SECRET)
  })

  it('JSON truncado com o header sensível: 400 sem eco do valor', async () => {
    const response = await POST(
      raw('http://playground.test/api/tools', 'POST', `{"headers":{"Authorization":"${SECRET}"`)
    )

    expect(response.status).toBe(400)
    expect(await response.text()).not.toContain(SECRET)
    expect(JSON.stringify(logged)).not.toContain(SECRET)
  })
})
