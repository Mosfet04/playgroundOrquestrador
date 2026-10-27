// @vitest-environment node
import { http, HttpResponse } from 'msw'
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { DELETE, GET as GET_BY_ID, PUT } from '@/app/api/teams/[id]/route'
import { GET, POST } from '@/app/api/teams/route'

import { TEST_ENV } from '../../../e2e/test-env'
import { server } from '../../msw/server'

// P3-04: CRUD de teams pela API Admin do orquestrador (chave admin), no padrão
// de agents (tests/app/api/agents.test.ts): o BFF traduz o formulário
// (camelCase) para o documento snake_case e de volta; a version lida vai no
// If-Match; o PUT preserva o que o formulário não conhece; 422 com campo vira o
// campo do formulário, sem o valor. Sessão e Origin: tests/middleware.test.ts.

const BASE = TEST_ENV.ORCHESTRATOR_URL
const ADMIN = `Bearer ${TEST_ENV.ORCHESTRATOR_API_KEY_ADMIN}`
const API = 'http://playground.test/api/teams'
const LEAK = 'detalhe-interno-do-orquestrador'

// Documento como o GET da API Admin o mostra (entity_document + version).
const stored = {
  id: 'suporte',
  nome: 'Suporte',
  descricao: 'Time de suporte',
  prompt: 'Escolha o melhor membro.',
  factory_ia_model: 'openai',
  model: 'gpt-4o',
  member_ids: ['assistente', 'pesquisador'],
  mode: 'coordinate',
  user_memory_active: true,
  summary_active: false,
  active: true,
  model_params: { temperature: 0.2 },
  base_url: null,
  api_key_ref: 'env:OPENAI_API_KEY',
  markdown: false,
  add_history_to_context: true,
  future_key: 'fica',
  version: 3
}

const asForm = {
  id: 'suporte',
  nome: 'Suporte',
  descricao: 'Time de suporte',
  prompt: 'Escolha o melhor membro.',
  factoryIaModel: 'openai',
  model: 'gpt-4o',
  member_ids: ['assistente', 'pesquisador'],
  mode: 'coordinate',
  user_memory_active: true,
  summary_active: false,
  active: true,
  model_params: { temperature: 0.2 },
  api_key_ref: 'env:OPENAI_API_KEY',
  markdown: false,
  add_history_to_context: true,
  version: 3
}

// Corpo do TeamForm.
const formBody = {
  id: 'novo',
  nome: 'Novo',
  factoryIaModel: 'ollama',
  model: 'llama3.2',
  member_ids: ['assistente'],
  mode: 'route',
  descricao: '',
  prompt: 'Olá',
  active: true
}

const options = {
  model_params: { temperature: 0.7, stop: 'FIM', stream: true },
  base_url: 'http://llm.local:8080/v1',
  api_key_ref: 'env:OLLAMA_API_KEY',
  markdown: false,
  add_history_to_context: false,
  user_memory_active: false,
  summary_active: true
}

const doc = (patch: Record<string, unknown>) => ({ ...stored, ...patch })

function jsonRequest(url: string, method: string, body: unknown, headers: Record<string, string> = {}) {
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

function serveList(items: object[]) {
  server.use(
    http.get(`${BASE}/admin/config/teams`, async ({ request }) => {
      await record(request)
      const offset = Number(new URL(request.url).searchParams.get('offset') ?? 0)
      return HttpResponse.json({ items: items.slice(offset, offset + 2), total: items.length, offset, limit: 200 })
    })
  )
}

function serveItem(method: 'get' | 'put' | 'delete' | 'post', respond: () => Response) {
  const path = method === 'post' ? `${BASE}/admin/config/teams` : `${BASE}/admin/config/teams/:id`
  server.use(
    http[method](path, async ({ request }) => {
      await record(request)
      return respond()
    })
  )
}

const refusal = (status: number, body: object = { detail: LEAK }) => () =>
  HttpResponse.json(body, { status })

beforeEach(() => {
  seen = []
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

describe('GET /api/teams', () => {
  const list = [
    stored,
    doc({ id: 'vendas', nome: 'Vendas', descricao: null, prompt: null, active: false, member_ids: ['a'], version: 1 }),
    doc({ id: 'literal', nome: 'busca .*(a+)+$ literal', member_ids: ['a'], version: 1 }),
    doc({ id: 'legado', nome: 'Legado', prompt: ['Linha 1', 'Linha 2'], member_ids: ['a'], version: 1 })
  ]

  it('lê todas as páginas com a chave admin e devolve no formato do formulário, com version', async () => {
    serveList(list)

    const response = await GET(new NextRequest(`${API}?limit=100`))

    expect(response.status).toBe(200)
    const { success, data } = await response.json()
    expect(success).toBe(true)
    expect(data).toMatchObject({ total: 4, page: 1, limit: 100, totalPages: 1 })
    expect(data.data[0]).toEqual(asForm)
    expect(data.data[1]).toMatchObject({ id: 'vendas', descricao: '', prompt: '', active: false })
    expect(data.data[3].prompt).toBe('Linha 1\nLinha 2')
    expect(seen.map((s) => s.path)).toEqual([
      '/admin/config/teams?offset=0&limit=200',
      '/admin/config/teams?offset=2&limit=200'
    ])
    expect(seen.every((s) => s.auth === ADMIN)).toBe(true)
  })

  it('busca em nome, descrição e id como texto literal; filtra por status; pagina', async () => {
    serveList(list)
    const ids = async (query: string) =>
      ((await (await GET(new NextRequest(`${API}?${query}`))).json()).data.data as { id: string }[]).map((t) => t.id)

    expect(await ids(`search=${encodeURIComponent('.*(A+)+$')}`)).toEqual(['literal'])
    expect(await ids('search=LEGADO')).toEqual(['legado'])
    expect(await ids('active=false')).toEqual(['vendas'])
    expect(await ids('page=2&limit=3')).toEqual(['legado'])
  })

  it.each(['limit=0', 'limit=101', 'page=0', 'active=talvez'])(
    'query inválida (%s) ⇒ 400 sem chamar o orquestrador',
    async (query) => {
      serveList(list)

      const response = await GET(new NextRequest(`${API}?${query}`))

      expect(response.status).toBe(400)
      expect(seen).toEqual([])
    }
  )

  it('orquestrador fora ⇒ 503 unreachable', async () => {
    server.use(http.get(`${BASE}/admin/config/teams`, () => HttpResponse.error()))

    const response = await GET(new NextRequest(API))

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ success: false, error: 'unreachable' })
  })
})

describe('GET /api/teams/[id]', () => {
  it('lê o documento pelo id codificado e devolve no formato do formulário', async () => {
    serveItem('get', () => HttpResponse.json(stored))

    const response = await GET_BY_ID(new NextRequest(`${API}/x`), params('time alfa'))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ success: true, data: asForm })
    expect(seen).toMatchObject([{ method: 'GET', path: '/admin/config/teams/time%20alfa', auth: ADMIN }])
  })

  it('404 do orquestrador ⇒ 404 not_found, sem eco', async () => {
    serveItem('get', refusal(404))

    const response = await GET_BY_ID(new NextRequest(`${API}/x`), params('sumiu'))

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ success: false, error: 'not_found' })
  })

  it('id que muda a rota (..) ⇒ 400 sem chamar o orquestrador', async () => {
    serveItem('get', () => HttpResponse.json(stored))

    const response = await GET_BY_ID(new NextRequest(`${API}/x`), params('..'))

    expect(response.status).toBe(400)
    expect(seen).toEqual([])
  })

  it('documento fora do formato ⇒ 502 invalid_response', async () => {
    serveItem('get', () => HttpResponse.json(doc({ member_ids: 'assistente' })))

    const response = await GET_BY_ID(new NextRequest(`${API}/x`), params('suporte'))

    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({ success: false, error: 'invalid_response' })
  })
})

describe('POST /api/teams', () => {
  it('cria com o documento snake_case, sem os opcionais vazios, e devolve o criado', async () => {
    serveItem('post', () => HttpResponse.json(doc({ id: 'novo', nome: 'Novo', version: 1 }), { status: 201 }))

    const response = await POST(jsonRequest(API, 'POST', { ...formBody, model_params: {}, base_url: '', api_key_ref: ' ' }))

    expect(response.status).toBe(200)
    expect((await response.json()).data).toMatchObject({ id: 'novo', version: 1 })
    expect(seen).toEqual([
      {
        method: 'POST',
        path: '/admin/config/teams',
        auth: ADMIN,
        ifMatch: null,
        body: {
          id: 'novo',
          nome: 'Novo',
          factory_ia_model: 'ollama',
          model: 'llama3.2',
          member_ids: ['assistente'],
          mode: 'route',
          descricao: '',
          prompt: 'Olá',
          active: true
        }
      }
    ])
  })

  it('traduz modelo, execução e memória, com o tipo dos parâmetros como vieram', async () => {
    serveItem('post', () => HttpResponse.json(doc({ id: 'novo' }), { status: 201 }))

    await POST(jsonRequest(API, 'POST', { ...formBody, ...options }))

    expect(seen[0].body).toMatchObject(options)
    expect((seen[0].body as { model_params: object }).model_params).toStrictEqual(options.model_params)
  })

  it.each([
    ['sem membro', { member_ids: [] }],
    ['membro em branco', { member_ids: [' '] }],
    ['membros que não são lista', { member_ids: 'assistente' }],
    ['modo ausente', { mode: undefined }],
    ['modo em objeto', { mode: { $ne: null } }],
    ['parâmetro com valor objeto', { model_params: { stop: { a: 1 } } }],
    ['markdown em texto', { markdown: 'sim' }],
    ['referência que não é texto', { api_key_ref: { $ne: null } }]
  ])('%s ⇒ 400 sem chamar o orquestrador', async (_, patch) => {
    serveItem('post', () => HttpResponse.json(stored, { status: 201 }))

    const response = await POST(jsonRequest(API, 'POST', { ...formBody, ...patch }))

    expect(response.status).toBe(400)
    expect(seen).toEqual([])
  })

  it('campo que só o agent tem é descartado, não repassado', async () => {
    serveItem('post', () => HttpResponse.json(doc({ id: 'novo' }), { status: 201 }))

    await POST(jsonRequest(API, 'POST', { ...formBody, num_history_runs: 3, tools_ids: ['x'] }))

    expect(seen[0].body).not.toHaveProperty('num_history_runs')
    expect(seen[0].body).not.toHaveProperty('tools_ids')
  })

  it('JSON malformado ⇒ 400', async () => {
    const response = await POST(jsonRequest(API, 'POST', '{"id":'))

    expect(response.status).toBe(400)
    expect(seen).toEqual([])
  })

  it('id existente (409) ⇒ 409 conflict, sem eco', async () => {
    serveItem('post', refusal(409))

    const response = await POST(jsonRequest(API, 'POST', formBody))

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ success: false, error: 'conflict' })
  })

  it.each([
    ['member_ids', 'member_ids'],
    ['mode', 'mode'],
    ['factory_ia_model', 'factoryIaModel'],
    ['model', 'model'],
    ['nome', 'nome'],
    ['model_params', 'model_params'],
    ['base_url', 'base_url'],
    ['api_key_ref', 'api_key_ref'],
    ['markdown', 'markdown'],
    ['add_history_to_context', 'add_history_to_context'],
    ['user_memory_active', 'user_memory_active'],
    ['summary_active', 'summary_active']
  ])('422 em %s ⇒ 422 no campo %s do formulário, sem o valor', async (field, formField) => {
    serveItem('post', refusal(422, { detail: LEAK, field, indexes: [0] }))

    const response = await POST(jsonRequest(API, 'POST', { ...formBody, nome: 'VALOR-ENVIADO' }))

    expect(response.status).toBe(422)
    const text = await response.text()
    expect(JSON.parse(text)).toEqual({ success: false, error: 'invalid_config', field: formField })
    expect(text).not.toMatch(/VALOR-ENVIADO|detalhe-interno/)
  })

  it.each([
    ['campo do agent', { detail: LEAK, field: 'tools_ids' }],
    ['parâmetro por nome', { detail: LEAK, field: 'model_params.temperature' }],
    ['propriedade de Object', { detail: LEAK, field: 'constructor' }],
    ['sem campo', { detail: LEAK, error_type: 'ValueError' }]
  ])('422 com %s ⇒ 422 sem campo', async (_, body) => {
    serveItem('post', refusal(422, body))

    const response = await POST(jsonRequest(API, 'POST', formBody))

    expect(response.status).toBe(422)
    expect(await response.json()).toEqual({ success: false, error: 'invalid_config' })
  })
})

describe('PUT /api/teams/[id]', () => {
  const { id: _id, ...updateBody } = formBody
  void _id

  it('sobrescreve os campos do formulário no documento atual e preserva o que ele não conhece', async () => {
    serveItem('get', () => HttpResponse.json(stored))
    serveItem('put', () => HttpResponse.json(doc({ nome: 'Renomeado', version: 4 })))

    const response = await PUT(
      jsonRequest(`${API}/suporte`, 'PUT', { ...updateBody, ...options, nome: 'Renomeado', member_ids: ['pesquisador'] }, { 'If-Match': '"3"' }),
      params('suporte')
    )

    expect(response.status).toBe(200)
    expect((await response.json()).data).toMatchObject({ nome: 'Renomeado', version: 4 })
    expect(seen.map((s) => `${s.method} ${s.path}`)).toEqual([
      'GET /admin/config/teams/suporte',
      'PUT /admin/config/teams/suporte'
    ])
    const { version: _version, ...current } = stored
    void _version
    expect(seen[1]).toMatchObject({ auth: ADMIN, ifMatch: '"3"' })
    expect(seen[1].body).toEqual({
      ...current,
      ...options,
      nome: 'Renomeado',
      factory_ia_model: 'ollama',
      model: 'llama3.2',
      member_ids: ['pesquisador'],
      mode: 'route',
      descricao: '',
      prompt: 'Olá',
      active: true
    })
  })

  it('campo opcional vazio no formulário sai do documento; chave desconhecida fica', async () => {
    serveItem('get', () => HttpResponse.json(stored))
    serveItem('put', () => HttpResponse.json(doc({ version: 4 })))

    await PUT(
      jsonRequest(`${API}/suporte`, 'PUT', { ...updateBody, model_params: {}, base_url: '', api_key_ref: '' }, { 'If-Match': '3' }),
      params('suporte')
    )

    const body = seen[1].body as Record<string, unknown>
    for (const key of ['model_params', 'base_url', 'api_key_ref', 'markdown', 'add_history_to_context'])
      expect(body).not.toHaveProperty(key)
    expect(body).toMatchObject({ future_key: 'fica' })
    expect(seen[1].ifMatch).toBe('"3"')
  })

  it.each([
    ['sem If-Match', {}],
    ['If-Match que não é versão', { 'If-Match': 'W/"abc"' }]
  ])('%s ⇒ 400 sem chamar o orquestrador', async (_, headers) => {
    serveItem('get', () => HttpResponse.json(stored))

    const response = await PUT(jsonRequest(`${API}/suporte`, 'PUT', updateBody, headers), params('suporte'))

    expect(response.status).toBe(400)
    expect(seen).toEqual([])
  })

  it('operador no corpo ⇒ 400 sem chamar o orquestrador', async () => {
    serveItem('get', () => HttpResponse.json(stored))

    const response = await PUT(
      jsonRequest(`${API}/suporte`, 'PUT', { ...updateBody, member_ids: { $ne: null } }, { 'If-Match': '"3"' }),
      params('suporte')
    )

    expect(response.status).toBe(400)
    expect(seen).toEqual([])
  })

  it('versão divergente (412) ⇒ 412 version_conflict', async () => {
    serveItem('get', () => HttpResponse.json(stored))
    serveItem('put', refusal(412))

    const response = await PUT(
      jsonRequest(`${API}/suporte`, 'PUT', updateBody, { 'If-Match': '"2"' }),
      params('suporte')
    )

    expect(response.status).toBe(412)
    expect(await response.json()).toEqual({ success: false, error: 'version_conflict' })
  })

  it('team que sumiu ⇒ 404 sem PUT', async () => {
    serveItem('get', refusal(404))

    const response = await PUT(
      jsonRequest(`${API}/suporte`, 'PUT', updateBody, { 'If-Match': '"3"' }),
      params('suporte')
    )

    expect(response.status).toBe(404)
    expect(seen.map((s) => s.method)).toEqual(['GET'])
  })

  it('422 em member_ids no PUT vira o campo do formulário', async () => {
    serveItem('get', () => HttpResponse.json(stored))
    serveItem('put', refusal(422, { detail: LEAK, field: 'member_ids' }))

    const response = await PUT(
      jsonRequest(`${API}/suporte`, 'PUT', updateBody, { 'If-Match': '"3"' }),
      params('suporte')
    )

    expect(response.status).toBe(422)
    expect(await response.json()).toEqual({ success: false, error: 'invalid_config', field: 'member_ids' })
  })
})

describe('DELETE /api/teams/[id]', () => {
  const del = (id: string, headers: Record<string, string> = { 'If-Match': '"3"' }) =>
    DELETE(new NextRequest(`${API}/${id}`, { method: 'DELETE', headers }), params(id))

  it('exclui de vez (hard=true) com o If-Match do browser', async () => {
    serveItem('delete', () => new HttpResponse(null, { status: 204 }))

    const response = await del('suporte')

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ success: true })
    expect(seen).toEqual([
      { method: 'DELETE', path: '/admin/config/teams/suporte?hard=true', auth: ADMIN, ifMatch: '"3"' }
    ])
  })

  it('sem If-Match ⇒ 400; 412 ⇒ version_conflict; 404 ⇒ not_found', async () => {
    serveItem('delete', refusal(412))
    expect((await del('suporte', {})).status).toBe(400)
    expect(seen).toEqual([])

    expect((await del('suporte')).status).toBe(412)

    serveItem('delete', refusal(404))
    expect((await del('suporte')).status).toBe(404)
  })
})

describe('segurança', () => {
  it('nenhuma resposta leva a chave admin, a URL interna ou o corpo de erro do orquestrador', async () => {
    const responses: Response[] = []
    serveItem('get', refusal(500, { detail: LEAK, key: TEST_ENV.ORCHESTRATOR_API_KEY_ADMIN }))
    serveItem('post', refusal(422, { detail: LEAK, field: 'model' }))
    server.use(http.get(`${BASE}/admin/config/teams`, () => HttpResponse.error()))

    responses.push(await GET(new NextRequest(API)))
    responses.push(await GET_BY_ID(new NextRequest(`${API}/x`), params('suporte')))
    responses.push(await POST(jsonRequest(API, 'POST', formBody)))

    for (const response of responses) {
      const text = await response.text()
      expect(text).not.toContain(TEST_ENV.ORCHESTRATOR_API_KEY_ADMIN)
      expect(text).not.toContain(BASE)
      expect(text).not.toContain(LEAK)
    }
  })

  it('api_key_ref segue como referência: o que o orquestrador devolve é o que sai', async () => {
    serveItem('get', () => HttpResponse.json(stored))

    const body = await (await GET_BY_ID(new NextRequest(`${API}/x`), params('suporte'))).json()

    expect(body.data.api_key_ref).toBe('env:OPENAI_API_KEY')
  })
})
