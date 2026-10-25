// @vitest-environment node
import { http, HttpResponse } from 'msw'
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { DELETE, GET as GET_BY_ID, PUT } from '@/app/api/tools/[id]/route'
import { GET, POST } from '@/app/api/tools/route'

import { TEST_ENV } from '../../../e2e/test-env'
import { server } from '../../msw/server'

// P2-06: CRUD de tools pela API Admin do orquestrador (chave admin), sem
// Mongo. O documento da tool tem os mesmos nomes do formulário; saem os campos
// legados (base_url/method/endpoint). Header em texto volta mascarado (`***`)
// e o BFF repassa a máscara como veio: o orquestrador mantém o valor gravado.

const BASE = TEST_ENV.ORCHESTRATOR_URL
const ADMIN = `Bearer ${TEST_ENV.ORCHESTRATOR_API_KEY_ADMIN}`
const API = 'http://playground.test/api/tools'
const LEAK = 'detalhe-interno-do-orquestrador'

const parameter = {
  name: 'cidade',
  type: 'string',
  description: 'Nome da cidade',
  required: true,
  default_value: null
}

const stored = {
  id: 'clima',
  name: 'Clima',
  description: 'Consulta a previsão do tempo',
  route: 'https://clima.example.com/v1/previsao',
  http_method: 'GET',
  parameters: [parameter],
  instructions: null,
  headers: { 'X-Api-Key': '***', 'X-Conta': 'env:CLIMA_CONTA' },
  active: true,
  version: 2
}

const asForm = {
  id: 'clima',
  name: 'Clima',
  description: 'Consulta a previsão do tempo',
  route: 'https://clima.example.com/v1/previsao',
  http_method: 'GET',
  parameters: [parameter],
  instructions: '',
  headers: { 'X-Api-Key': '***', 'X-Conta': 'env:CLIMA_CONTA' },
  active: true,
  version: 2
}

// Corpo do ToolForm (inclui os campos legados que ele ainda manda).
const formBody = {
  id: 'clima',
  name: 'Clima',
  description: 'Consulta a previsão do tempo',
  route: 'https://clima.example.com/v1/previsao',
  http_method: 'GET',
  instructions: '',
  headers: { 'X-Api-Key': '***' },
  parameters: [{ name: 'cidade', type: 'string', description: 'Nome da cidade', required: true }],
  active: true,
  base_url: '',
  method: 'GET',
  endpoint: ''
}

const doc = (patch: Record<string, unknown>) => ({ ...stored, ...patch })

function jsonRequest(
  url: string,
  method: string,
  body: unknown,
  headers: Record<string, string> = {}
) {
  return new NextRequest(url, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body)
  })
}

const params = (id: string) => ({ params: Promise.resolve({ id }) })

type Seen = { method: string; path: string; auth: string | null; ifMatch: string | null; body?: unknown }
let seen: Seen[] = []

async function record(request: Request) {
  const url = new URL(request.url)
  const text = request.method === 'GET' || request.method === 'DELETE' ? '' : await request.text()
  seen.push({
    method: request.method,
    path: `${url.pathname}${url.search}`,
    auth: request.headers.get('authorization'),
    ifMatch: request.headers.get('if-match'),
    ...(text ? { body: JSON.parse(text) } : {})
  })
}

function serve(method: 'get' | 'put' | 'delete' | 'post', path: string, respond: () => Response) {
  server.use(
    http[method](`${BASE}${path}`, async ({ request }) => {
      await record(request)
      return respond()
    })
  )
}

const serveList = (items: object[]) =>
  serve('get', '/admin/config/tools', () =>
    HttpResponse.json({ items, total: items.length, offset: 0, limit: 200 })
  )

const refusal = (status: number, body: object = { detail: LEAK }) => () =>
  HttpResponse.json(body, { status })

beforeEach(() => {
  seen = []
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

describe('GET /api/tools', () => {
  const list = [
    stored,
    doc({ id: 'cep', name: 'CEP', description: 'Busca endereço', http_method: 'POST', headers: null, version: 1 }),
    doc({ id: 'literal', name: 'busca .*(a+)+$ literal', version: 1 })
  ]

  it('lista com a chave admin no formato do formulário, header mascarado como veio', async () => {
    serveList(list)

    const response = await GET(new NextRequest(`${API}?limit=100`))

    expect(response.status).toBe(200)
    const { data } = await response.json()
    expect(data).toMatchObject({ total: 3, page: 1, limit: 100, totalPages: 1 })
    expect(data.data[0]).toEqual(asForm)
    expect(data.data[1].headers).toEqual({})
    expect(seen[0]).toMatchObject({ path: '/admin/config/tools?offset=0&limit=200', auth: ADMIN })
  })

  it('busca literal sem diferenciar maiúsculas e filtra pelo método', async () => {
    serveList(list)

    const literal = await (await GET(new NextRequest(`${API}?search=${encodeURIComponent('.*(A+)+$')}`))).json()
    const post = await (await GET(new NextRequest(`${API}?method=post`))).json()

    expect(literal.data.data.map((t: { id: string }) => t.id)).toEqual(['literal'])
    expect(post.data.data.map((t: { id: string }) => t.id)).toEqual(['cep'])
  })
})

describe('GET /api/tools/[id]', () => {
  it('devolve a tool com o header mascarado (o valor gravado não sai do orquestrador)', async () => {
    serve('get', '/admin/config/tools/:id', () => HttpResponse.json(stored))

    const response = await GET_BY_ID(new NextRequest(`${API}/clima`), params('clima'))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ success: true, data: asForm })
    expect(seen[0]).toMatchObject({ path: '/admin/config/tools/clima', auth: ADMIN })
  })
})

describe('/api/tools/[id]: id com `%` literal (review P2-06, R1)', () => {
  it('vai codificado uma vez só (a%41 ⇒ a%2541) no GET, PUT e DELETE', async () => {
    serve('get', '/admin/config/tools/:id', () => HttpResponse.json(stored))
    serve('put', '/admin/config/tools/:id', () => HttpResponse.json(stored))
    serve('delete', '/admin/config/tools/:id', () => new HttpResponse(null, { status: 204 }))
    const ifMatch = { 'If-Match': '"2"' }

    await GET_BY_ID(new NextRequest(`${API}/x`), params('a%41'))
    await PUT(jsonRequest(`${API}/x`, 'PUT', formBody, ifMatch), params('a%41'))
    await DELETE(new NextRequest(`${API}/x`, { method: 'DELETE', headers: ifMatch }), params('a%41'))

    expect(seen.map((s) => s.path)).toEqual([
      '/admin/config/tools/a%2541',
      '/admin/config/tools/a%2541',
      '/admin/config/tools/a%2541?hard=true'
    ])
    expect((seen[1].body as { id: string }).id).toBe('a%41')
  })
})

describe('POST /api/tools', () => {
  it('cria com o documento do contrato, sem os campos legados', async () => {
    serve('post', '/admin/config/tools', () => HttpResponse.json(doc({ version: 1 }), { status: 201 }))

    const response = await POST(
      jsonRequest(API, 'POST', { ...formBody, headers: { 'X-Conta': 'env:CLIMA_CONTA' } })
    )

    expect(response.status).toBe(200)
    expect((await response.json()).data).toMatchObject({ id: 'clima', version: 1 })
    expect(seen[0]).toMatchObject({ method: 'POST', auth: ADMIN })
    expect(seen[0].body).toEqual({
      id: 'clima',
      name: 'Clima',
      description: 'Consulta a previsão do tempo',
      route: 'https://clima.example.com/v1/previsao',
      http_method: 'GET',
      instructions: '',
      headers: { 'X-Conta': 'env:CLIMA_CONTA' },
      parameters: [{ name: 'cidade', type: 'string', description: 'Nome da cidade', required: true }],
      active: true
    })
  })

  it('sem http_method usa o legado `method` e, sem ele, GET', async () => {
    serve('post', '/admin/config/tools', () => HttpResponse.json(stored, { status: 201 }))
    const { http_method: _m, method: _l, ...withoutMethod } = formBody
    void _m
    void _l

    await POST(jsonRequest(API, 'POST', { ...withoutMethod, method: 'post' }))
    await POST(jsonRequest(API, 'POST', withoutMethod))

    expect(seen.map((s) => (s.body as { http_method: string }).http_method)).toEqual(['post', 'GET'])
  })

  it('repassa default_value como dado (a recusa de `$` é do orquestrador)', async () => {
    serve('post', '/admin/config/tools', () => HttpResponse.json(stored, { status: 201 }))
    const withDefault = { ...formBody.parameters[0], type: 'object', default_value: { $ne: null } }

    await POST(jsonRequest(API, 'POST', { ...formBody, parameters: [withDefault] }))

    expect((seen[0].body as { parameters: unknown[] }).parameters).toEqual([withDefault])
  })

  it.each([
    ['operador no id', { ...formBody, id: { $ne: null } }],
    ['operador nos headers', { ...formBody, headers: { Authorization: { $ne: '' } } }],
    ['parâmetro do tipo number', { ...formBody, parameters: [{ ...formBody.parameters[0], type: 'number' }] }],
    ['description vazia', { ...formBody, description: '  ' }]
  ])('recusa %s com 400 sem chamar o orquestrador', async (_, body) => {
    serve('post', '/admin/config/tools', () => HttpResponse.json(stored, { status: 201 }))

    const response = await POST(jsonRequest(API, 'POST', body))

    expect(response.status).toBe(400)
    expect(seen).toEqual([])
  })

  it('id existente (409) ⇒ 409 conflict', async () => {
    serve('post', '/admin/config/tools', refusal(409))

    const response = await POST(jsonRequest(API, 'POST', formBody))

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ success: false, error: 'conflict' })
  })

  it.each([
    [{ field: 'headers' }, 'headers'],
    [{ field: 'route' }, 'route'],
    [{ field: 'http_method' }, 'http_method'],
    [{ field: 'parameters', indexes: [1] }, 'parameters.1']
  ])('422 %j ⇒ campo %s do formulário, sem o valor', async (where, formField) => {
    serve('post', '/admin/config/tools', refusal(422, { detail: LEAK, ...where }))

    const response = await POST(
      jsonRequest(API, 'POST', { ...formBody, headers: { Authorization: 'Bearer VALOR-SECRETO' } })
    )

    expect(response.status).toBe(422)
    const text = await response.text()
    expect(JSON.parse(text)).toEqual({ success: false, error: 'invalid_config', field: formField })
    expect(text).not.toMatch(/VALOR-SECRETO|detalhe-interno/)
  })

  it('422 em parameters sem posição ⇒ sem campo', async () => {
    serve('post', '/admin/config/tools', refusal(422, { detail: LEAK, field: 'parameters' }))

    const response = await POST(jsonRequest(API, 'POST', formBody))

    expect(await response.json()).toEqual({ success: false, error: 'invalid_config' })
  })
})

describe('PUT /api/tools/[id]', () => {
  it('reenvia o header mascarado como veio, com o If-Match do browser', async () => {
    serve('put', '/admin/config/tools/:id', () => HttpResponse.json(doc({ version: 3 })))

    const response = await PUT(
      jsonRequest(`${API}/clima`, 'PUT', formBody, { 'If-Match': '"2"' }),
      params('clima')
    )

    expect(response.status).toBe(200)
    expect((await response.json()).data.version).toBe(3)
    expect(seen).toHaveLength(1)
    expect(seen[0]).toMatchObject({ method: 'PUT', path: '/admin/config/tools/clima', auth: ADMIN, ifMatch: '"2"' })
    expect(seen[0].body).toMatchObject({ id: 'clima', headers: { 'X-Api-Key': '***' } })
  })

  it('sem If-Match ⇒ 400 sem chamar o orquestrador', async () => {
    serve('put', '/admin/config/tools/:id', () => HttpResponse.json(stored))

    const response = await PUT(jsonRequest(`${API}/clima`, 'PUT', formBody), params('clima'))

    expect(response.status).toBe(400)
    expect(seen).toEqual([])
  })

  it('412 ⇒ 412 version_conflict', async () => {
    serve('put', '/admin/config/tools/:id', refusal(412))

    const response = await PUT(
      jsonRequest(`${API}/clima`, 'PUT', formBody, { 'If-Match': '"1"' }),
      params('clima')
    )

    expect(response.status).toBe(412)
    expect(await response.json()).toEqual({ success: false, error: 'version_conflict' })
  })
})

describe('DELETE /api/tools/[id]', () => {
  const del = (headers: Record<string, string> = { 'If-Match': '"2"' }) =>
    DELETE(new NextRequest(`${API}/clima`, { method: 'DELETE', headers }), params('clima'))

  it('exclui de vez (hard=true) com o If-Match', async () => {
    serve('delete', '/admin/config/tools/:id', () => new HttpResponse(null, { status: 204 }))

    const response = await del()

    expect(response.status).toBe(200)
    expect(seen[0]).toMatchObject({ path: '/admin/config/tools/clima?hard=true', ifMatch: '"2"', auth: ADMIN })
  })

  it('tool usada por um agent (409) ⇒ 409 conflict, sem quem usa', async () => {
    serve('delete', '/admin/config/tools/:id', refusal(409, { detail: LEAK, used_by: { agents: ['agente-secreto'] } }))

    const response = await del()

    expect(response.status).toBe(409)
    expect(await response.text()).not.toContain('agente-secreto')
  })

  it('sem If-Match ⇒ 400', async () => {
    serve('delete', '/admin/config/tools/:id', () => new HttpResponse(null, { status: 204 }))

    const response = await del({})

    expect(response.status).toBe(400)
    expect(seen).toEqual([])
  })
})
