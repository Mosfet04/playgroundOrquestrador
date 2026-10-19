// @vitest-environment node
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { GET as GET_BY_ID, PUT } from '@/app/api/tools/[id]/route'
import { GET, POST } from '@/app/api/tools/route'

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

function jsonRequest(url: string, method: string, body: unknown) {
  return new NextRequest(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
}

const routeParams = (id: string) => ({ params: Promise.resolve({ id }) })

beforeEach(() => {
  toolsCollection.reset()
})

describe('POST /api/tools', () => {
  it.each([
    ['o corpo só com operador', { id: { $ne: null } }],
    ['operador no id', { ...validTool, id: { $ne: null } }],
    [
      'operador nos headers',
      { ...validTool, headers: { Authorization: { $ne: '' } } }
    ]
  ])('recusa %s com 400 sem tocar o banco', async (_, body) => {
    const response = await POST(jsonRequest(BASE_URL, 'POST', body))

    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ success: false })
    expect(toolsCollection.calls).toEqual([])
  })

  it.each([
    ['ausente', undefined],
    ['vazia', ''],
    ['só com espaços', '   ']
  ])('recusa description %s com 400', async (_, description) => {
    const response = await POST(
      jsonRequest(BASE_URL, 'POST', { ...validTool, description })
    )

    expect(response.status).toBe(400)
    expect(toolsCollection.calls).toEqual([])
  })

  it('recusa parâmetro do tipo `number` (o orquestrador não carrega a tool)', async () => {
    const response = await POST(
      jsonRequest(BASE_URL, 'POST', {
        ...validTool,
        parameters: [
          { name: 'dias', type: 'number', description: 'Dias', required: true }
        ]
      })
    )

    expect(response.status).toBe(400)
    expect((await response.json()).error).toContain('parameters.0.type')
    expect(toolsCollection.calls).toEqual([])
  })

  it('grava e lê de volta parâmetro do tipo `float`', async () => {
    const parameter = {
      name: 'latitude',
      type: 'float',
      description: 'Latitude em graus',
      required: true
    }

    const created = await POST(
      jsonRequest(BASE_URL, 'POST', { ...validTool, parameters: [parameter] })
    )
    expect(created.status).toBe(200)

    const response = await GET_BY_ID(
      new NextRequest(`${BASE_URL}/clima`),
      routeParams('clima')
    )
    expect(response.status).toBe(200)
    expect((await response.json()).data.parameters).toEqual([parameter])
  })

  it('grava só os campos conhecidos do parâmetro', async () => {
    const parameter = {
      name: 'cidade',
      type: 'string',
      description: 'Nome da cidade',
      required: true
    }

    const created = await POST(
      jsonRequest(BASE_URL, 'POST', {
        ...validTool,
        parameters: [{ ...parameter, $where: 'sleep(1000)' }]
      })
    )
    expect(created.status).toBe(200)

    const response = await GET_BY_ID(
      new NextRequest(`${BASE_URL}/clima`),
      routeParams('clima')
    )
    expect((await response.json()).data.parameters).toStrictEqual([parameter])
  })

  it('grava GET quando http_method falta', async () => {
    const withoutMethod: Record<string, unknown> = { ...validTool }
    delete withoutMethod.http_method

    const response = await POST(jsonRequest(BASE_URL, 'POST', withoutMethod))

    expect(response.status).toBe(200)
    expect((await response.json()).data.http_method).toBe('GET')
  })

  // Decisão 0006: o BFF valida o tipo; os valores aceitos são os do orquestrador.
  it('grava http_method em minúsculas (get)', async () => {
    const response = await POST(
      jsonRequest(BASE_URL, 'POST', { ...validTool, http_method: 'get' })
    )

    expect(response.status).toBe(200)
    expect((await response.json()).data.http_method).toBe('get')
  })

  it.each(['string', 'integer', 'float', 'boolean', 'object', 'array'])(
    'aceita parâmetro do tipo %s',
    async (type) => {
      const response = await POST(
        jsonRequest(BASE_URL, 'POST', {
          ...validTool,
          parameters: [
            { name: 'p', type, description: 'Parâmetro', required: false }
          ]
        })
      )

      expect(response.status).toBe(200)
    }
  )
})

describe('PUT /api/tools/[id]', () => {
  it('recusa operador no corpo com 400 sem tocar o banco', async () => {
    toolsCollection.reset([validTool])

    const response = await PUT(
      jsonRequest(`${BASE_URL}/clima`, 'PUT', {
        ...validTool,
        name: { $ne: null }
      }),
      routeParams('clima')
    )

    expect(response.status).toBe(400)
    expect(toolsCollection.calls).toEqual([])
  })

  it('recusa description vazia com 400', async () => {
    toolsCollection.reset([validTool])

    const response = await PUT(
      jsonRequest(`${BASE_URL}/clima`, 'PUT', {
        ...validTool,
        description: ''
      }),
      routeParams('clima')
    )

    expect(response.status).toBe(400)
    expect(toolsCollection.calls).toEqual([])
  })
})

describe('GET /api/tools/[id]', () => {
  it('não quebra com `route` que não é URL absoluta', async () => {
    toolsCollection.reset([{ ...validTool, route: '/v1/previsao' }])

    const response = await GET_BY_ID(
      new NextRequest(`${BASE_URL}/clima`),
      routeParams('clima')
    )

    expect(response.status).toBe(200)
    const { data } = await response.json()
    expect(data.route).toBe('/v1/previsao')
    expect(data.http_config).toMatchObject({
      base_url: '',
      endpoint: '/v1/previsao'
    })
  })

  it('não lê `host:porta/caminho` sem http(s) como URL', async () => {
    toolsCollection.reset([{ ...validTool, route: 'localhost:8080/x' }])

    const response = await GET_BY_ID(
      new NextRequest(`${BASE_URL}/clima`),
      routeParams('clima')
    )

    expect(response.status).toBe(200)
    expect((await response.json()).data.http_config).toMatchObject({
      base_url: '',
      endpoint: 'localhost:8080/x'
    })
  })
})

describe('GET /api/tools?search=', () => {
  it('trata o texto de busca como literal, não como regex', async () => {
    toolsCollection.reset([
      { ...validTool, id: 'repetido', name: 'aaaa' },
      { ...validTool, id: 'literal', name: 'busca .*(a+)+$ literal' }
    ])
    const search = encodeURIComponent('.*(a+)+$')

    const response = await GET(new NextRequest(`${BASE_URL}?search=${search}`))

    expect(response.status).toBe(200)
    const { data } = await response.json()
    expect(data.data.map((tool: { id: string }) => tool.id)).toEqual([
      'literal'
    ])
  })
})
