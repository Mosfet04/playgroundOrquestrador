// @vitest-environment node
// QA P0-05: o que o teste do dev não cobre (tipo errado e operador em cada campo,
// operador em default_value, eco de valor, tool legada com `number`).
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { GET as GET_BY_ID, PUT } from '@/app/api/tools/[id]/route'
import { POST } from '@/app/api/tools/route'

import { toolsCollection } from '../../helpers/fakeMongodb'

vi.mock('@/lib/mongodb', () => import('../../helpers/fakeMongodb'))

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

const getById = (id: string) =>
  GET_BY_ID(new NextRequest(`${BASE_URL}/${id}`), routeParams(id))

const stored = (id: string) => toolsCollection.findOne({ id })

beforeEach(() => {
  toolsCollection.reset()
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
  it.each(hostileFields)('recusa %s com 400 sem tocar o banco', async (_, patch) => {
    const response = await POST(
      jsonRequest(BASE_URL, 'POST', { ...validTool, id: 'novo', ...patch })
    )

    expect(response.status).toBe(400)
    expect(toolsCollection.calls).toEqual([])
  })

  it('recusa parâmetro sem descrição com 400', async () => {
    const response = await POST(
      jsonRequest(BASE_URL, 'POST', {
        ...validTool,
        parameters: [{ ...floatParameter, description: ' ' }]
      })
    )

    expect(response.status).toBe(400)
    expect(toolsCollection.calls).toEqual([])
  })

  // default_value é `unknown` por desenho (parâmetro tipo object/array pode ter
  // qualquer JSON). O valor é só dado: nunca entra em filtro nem em $set de topo.
  it('guarda operador em parameters[].default_value como dado inerte', async () => {
    const parameter = {
      name: 'filtro',
      type: 'object',
      description: 'Filtro livre',
      required: false,
      default_value: { $ne: null, aninhado: { $where: 'x' } }
    }

    const response = await POST(
      jsonRequest(BASE_URL, 'POST', { ...validTool, parameters: [parameter] })
    )

    expect(response.status).toBe(200)
    expect((await stored('clima'))?.parameters).toEqual([parameter])
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

describe('/api/tools/[id]: documentos já gravados', () => {
  // Documento legado com `number` (fora de escopo migrar): lê, mas só salva
  // depois de trocar o tipo. Registrado como comportamento conhecido.
  it('tool legada com `number` ainda é lida, mas o PUT que a repete é recusado', async () => {
    const legacy = {
      ...validTool,
      parameters: [{ ...floatParameter, type: 'number' }]
    }
    toolsCollection.reset([legacy])

    const read = await getById('clima')
    expect(read.status).toBe(200)
    expect((await read.json()).data.parameters[0].type).toBe('number')

    const response = await PUT(
      jsonRequest(`${BASE_URL}/clima`, 'PUT', legacy),
      routeParams('clima')
    )
    expect(response.status).toBe(400)
    expect((await response.json()).error).toContain('parameters.0.type')
  })

  it('route absoluta continua separada em origem e caminho', async () => {
    toolsCollection.reset([
      { ...validTool, route: 'https://clima.example.com:8443/v1/p?q=1&r=2' }
    ])

    const response = await getById('clima')

    expect(response.status).toBe(200)
    expect((await response.json()).data.http_config).toMatchObject({
      base_url: 'https://clima.example.com:8443',
      endpoint: '/v1/p?q=1&r=2'
    })
  })
})
