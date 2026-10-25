// @vitest-environment node
// QA P0-05: o que o teste do dev não cobre (tipo errado e operador em cada campo,
// eco de valor). Desde a P2-06 o BFF fala com a API Admin do orquestrador:
// corpo recusado aqui nem chega a ela.
import { http, HttpResponse } from 'msw'
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it } from 'vitest'

import { PUT } from '@/app/api/tools/[id]/route'
import { POST } from '@/app/api/tools/route'

import { TEST_ENV } from '../../../e2e/test-env'
import { server } from '../../msw/server'

const BASE_URL = 'http://playground.test/api/tools'

const validTool = {
  id: 'clima',
  name: 'Clima',
  description: 'Consulta a previsão do tempo',
  route: 'https://clima.example.com/v1/previsao',
  http_method: 'GET',
  headers: {},
  parameters: [],
  active: true
}

const floatParameter = {
  name: 'latitude',
  type: 'float',
  description: 'Latitude em graus',
  required: true
}

function rawRequest(url: string, method: string, body: string) {
  return new NextRequest(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body
  })
}

const jsonRequest = (url: string, method: string, body: unknown) =>
  rawRequest(url, method, JSON.stringify(body))

const routeParams = (id: string) => ({ params: Promise.resolve({ id }) })

// Chamadas que chegaram ao orquestrador.
let calls: string[] = []

beforeEach(() => {
  calls = []
  server.use(
    http.all(`${TEST_ENV.ORCHESTRATOR_URL}/*`, ({ request }) => {
      calls.push(`${request.method} ${new URL(request.url).pathname}`)
      return HttpResponse.json({ detail: 'não devia chegar' }, { status: 500 })
    })
  )
})

const hostileFields: Array<[string, Record<string, unknown>]> = [
  ['id como array', { id: ['a'] }],
  ['name como array', { name: ['a'] }],
  ['description como operador', { description: { $ne: '' } }],
  ['route como operador', { route: { $regex: '.*' } }],
  ['http_method como operador', { http_method: { $ne: 'GET' } }],
  ['method como array', { method: ['GET'] }],
  ['base_url como operador', { base_url: { $ne: null } }],
  ['endpoint como array', { endpoint: ['/x'] }],
  ['instructions como operador', { instructions: { $ne: null } }],
  ['active como texto', { active: 'true' }],
  ['headers como array', { headers: ['a'] }],
  ['headers com número', { headers: { a: 1 } }],
  ['parameters como objeto', { parameters: { $ne: null } }],
  ['parameters com texto', { parameters: ['p'] }],
  [
    'parameter.name como operador',
    { parameters: [{ ...floatParameter, name: { $ne: '' } }] }
  ],
  [
    'parameter.description como array',
    { parameters: [{ ...floatParameter, description: ['d'] }] }
  ],
  [
    'parameter.type como operador',
    { parameters: [{ ...floatParameter, type: { $ne: 'string' } }] }
  ],
  [
    'parameter.required como texto',
    { parameters: [{ ...floatParameter, required: 'yes' }] }
  ]
]

describe('POST /api/tools: corpo hostil', () => {
  it.each(hostileFields)('recusa %s com 400 sem chamar o orquestrador', async (_, patch) => {
    const response = await POST(
      jsonRequest(BASE_URL, 'POST', { ...validTool, id: 'novo', ...patch })
    )

    expect(response.status).toBe(400)
    expect(calls).toEqual([])
  })

  it('recusa parâmetro sem descrição com 400', async () => {
    const response = await POST(
      jsonRequest(BASE_URL, 'POST', {
        ...validTool,
        parameters: [{ ...floatParameter, description: ' ' }]
      })
    )

    expect(response.status).toBe(400)
    expect(calls).toEqual([])
  })

})

describe('erro de validação da tool: sem eco de valor', () => {
  it('cita só os campos, nunca o valor recebido', async () => {
    const response = await POST(
      jsonRequest(BASE_URL, 'POST', {
        ...validTool,
        description: { $where: 'SEGREDO_DESC' },
        headers: { Authorization: { $ne: 'SEGREDO_HEADER' } },
        parameters: [{ ...floatParameter, type: 'SEGREDO_TIPO' }]
      })
    )

    const text = await response.text()
    expect(response.status).toBe(400)
    expect(JSON.parse(text).error).toMatch(/^Campos inválidos: /)
    expect(text).toContain('parameters.0.type')
    expect(text).not.toMatch(/SEGREDO|\$where|\$ne/)
  })
})

describe('PUT /api/tools/[id]: corpo hostil', () => {
  it.each(hostileFields)('recusa %s com 400 sem chamar o orquestrador', async (_, patch) => {
    const request = new NextRequest(`${BASE_URL}/clima`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'If-Match': '"1"' },
      body: JSON.stringify({ ...validTool, ...patch })
    })
    const response = await PUT(request, routeParams('clima'))

    expect(response.status).toBe(400)
    expect(calls).toEqual([])
  })
})
