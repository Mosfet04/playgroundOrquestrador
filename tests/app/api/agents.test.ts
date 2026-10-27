// @vitest-environment node
import { http, HttpResponse } from 'msw'
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { DELETE, GET as GET_BY_ID, PUT } from '@/app/api/agents/[id]/route'
import { GET, POST } from '@/app/api/agents/route'

import { TEST_ENV } from '../../../e2e/test-env'
import { server } from '../../msw/server'

// P2-06: CRUD de agents pela API Admin do orquestrador (chave admin), sem
// Mongo. O BFF traduz o formulário (camelCase, rag_*) para o documento
// snake_case; a version lida vai no If-Match; 422 com campo vira o campo do
// formulário, sem o valor; 409/412 voltam com código próprio. Sessão e Origin:
// tests/middleware.test.ts.

const BASE = TEST_ENV.ORCHESTRATOR_URL
const ADMIN = `Bearer ${TEST_ENV.ORCHESTRATOR_API_KEY_ADMIN}`
const API = 'http://playground.test/api/agents'
const LEAK = 'detalhe-interno-do-orquestrador'

// Documento como o GET da API Admin o mostra (entity_document + version).
const stored = {
  id: 'assistente',
  nome: 'Assistente',
  factory_ia_model: 'openai',
  model: 'gpt-4o',
  descricao: 'Ajuda no dia a dia',
  prompt: 'Seja útil.',
  tools_ids: ['clima'],
  rag_config: {
    active: true,
    doc_name: 'base',
    model: 'embed-1',
    factory_ia_model: 'ollama',
    search_strategy: 'hierarchical',
    model_params: null,
    base_url: null,
    api_key_ref: null
  },
  user_memory_active: true,
  summary_active: false,
  active: true,
  model_params: { temperature: 0.2 },
  base_url: null,
  api_key_ref: 'env:OPENAI_API_KEY',
  markdown: false,
  add_history_to_context: true,
  num_history_runs: 9,
  add_datetime_to_context: true,
  reasoning: false,
  version: 3
}

const asForm = {
  id: 'assistente',
  nome: 'Assistente',
  model: 'gpt-4o',
  factoryIaModel: 'openai',
  descricao: 'Ajuda no dia a dia',
  prompt: 'Seja útil.',
  active: true,
  tools_ids: ['clima'],
  rag_config: {
    active: true,
    doc_name: 'base',
    model: 'embed-1',
    factoryIaModel: 'ollama'
  },
  model_params: { temperature: 0.2 },
  api_key_ref: 'env:OPENAI_API_KEY',
  markdown: false,
  add_history_to_context: true,
  num_history_runs: 9,
  add_datetime_to_context: true,
  reasoning: false,
  user_memory_active: true,
  summary_active: false,
  version: 3
}

// Corpo do AgentForm.
const formBody = {
  id: 'novo',
  nome: 'Novo',
  model: 'llama3.2',
  factoryIaModel: 'ollama',
  descricao: '',
  prompt: 'Olá',
  active: true,
  tools_ids: [],
  rag_active: false,
  rag_doc_name: '',
  rag_model: '',
  rag_factoryIaModel: 'openai'
}

// Os campos novos do formulário (P3-02): execução, memória, conexão e parâmetros.
const newFields = {
  model_params: { temperature: 0.7, stop: 'FIM', stream: true },
  base_url: 'http://llm.local:8080/v1',
  api_key_ref: 'env:OLLAMA_API_KEY',
  markdown: false,
  add_history_to_context: false,
  num_history_runs: 12,
  add_datetime_to_context: false,
  reasoning: true,
  user_memory_active: true,
  summary_active: true
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

// Lista paginada como a real ({items,total,offset,limit}), de 2 em 2 para
// exercitar o laço de páginas do BFF.
function serveList(items: object[]) {
  server.use(
    http.get(`${BASE}/admin/config/agents`, async ({ request }) => {
      await record(request)
      const offset = Number(new URL(request.url).searchParams.get('offset') ?? 0)
      return HttpResponse.json({
        items: items.slice(offset, offset + 2),
        total: items.length,
        offset,
        limit: 200
      })
    })
  )
}

function serveItem(method: 'get' | 'put' | 'delete' | 'post', respond: () => Response) {
  const path = method === 'post' ? `${BASE}/admin/config/agents` : `${BASE}/admin/config/agents/:id`
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

describe('GET /api/agents', () => {
  const list = [
    stored,
    doc({ id: 'pesquisador', nome: 'Pesquisador', factory_ia_model: 'ollama', rag_config: null, tools_ids: null, active: false, version: 1 }),
    doc({ id: 'literal', nome: 'busca .*(a+)+$ literal', descricao: null, rag_config: null, version: 1 }),
    doc({ id: 'repetido', nome: 'aaaa', descricao: 'AAAA', rag_config: null, version: 1 })
  ]

  it('lê todas as páginas com a chave admin e devolve no formato do formulário, com version', async () => {
    serveList(list)

    const response = await GET(new NextRequest(`${API}?limit=100`))

    expect(response.status).toBe(200)
    const { success, data } = await response.json()
    expect(success).toBe(true)
    expect(data).toMatchObject({ total: 4, page: 1, limit: 100, totalPages: 1 })
    expect(data.data[0]).toEqual(asForm)
    expect(data.data[1]).toEqual({
      id: 'pesquisador',
      nome: 'Pesquisador',
      model: 'gpt-4o',
      factoryIaModel: 'ollama',
      descricao: 'Ajuda no dia a dia',
      prompt: 'Seja útil.',
      active: false,
      tools_ids: [],
      model_params: { temperature: 0.2 },
      api_key_ref: 'env:OPENAI_API_KEY',
      markdown: false,
      add_history_to_context: true,
      num_history_runs: 9,
      add_datetime_to_context: true,
      reasoning: false,
      user_memory_active: true,
      summary_active: false,
      version: 1
    })
    expect(data.data[2].descricao).toBe('')
    expect(seen.map((s) => s.path)).toEqual([
      '/admin/config/agents?offset=0&limit=200',
      '/admin/config/agents?offset=2&limit=200'
    ])
    expect(seen.every((s) => s.auth === ADMIN)).toBe(true)
  })

  it('busca em nome, descrição e id sem diferenciar maiúsculas, como texto literal', async () => {
    serveList(list)

    const literal = await GET(new NextRequest(`${API}?search=${encodeURIComponent('.*(A+)+$')}`))
    const byDescription = await GET(new NextRequest(`${API}?search=aaaa`))

    expect((await literal.json()).data.data.map((a: { id: string }) => a.id)).toEqual(['literal'])
    expect((await byDescription.json()).data.data.map((a: { id: string }) => a.id)).toEqual([
      'repetido'
    ])
  })

  it('filtra por status e provider; pagina o resultado', async () => {
    serveList(list)

    const inactive = await (await GET(new NextRequest(`${API}?active=false`))).json()
    const ollama = await (await GET(new NextRequest(`${API}?factoryIaModel=ollama`))).json()
    const page2 = await (await GET(new NextRequest(`${API}?page=2&limit=3`))).json()

    expect(inactive.data.data.map((a: { id: string }) => a.id)).toEqual(['pesquisador'])
    expect(ollama.data.data.map((a: { id: string }) => a.id)).toEqual(['pesquisador'])
    expect(page2.data).toMatchObject({ total: 4, page: 2, limit: 3, totalPages: 2 })
    expect(page2.data.data.map((a: { id: string }) => a.id)).toEqual(['repetido'])
  })

  it('operador na query string não vira filtro', async () => {
    serveList(list)

    const response = await GET(
      new NextRequest(`${API}?factoryIaModel[$ne]=openai&search[$ne]=zzz&active[$ne]=true`)
    )

    expect((await response.json()).data.total).toBe(4)
  })

  it.each(['limit=0', 'limit=101', 'page=0', 'page=x', 'active=talvez'])(
    'query inválida (%s) ⇒ 400 sem chamar o orquestrador',
    async (query) => {
      serveList(list)

      const response = await GET(new NextRequest(`${API}?${query}`))

      expect(response.status).toBe(400)
      expect(seen).toEqual([])
    }
  )

  it('orquestrador fora ⇒ 503 unreachable', async () => {
    server.use(http.get(`${BASE}/admin/config/agents`, () => HttpResponse.error()))

    const response = await GET(new NextRequest(API))

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ success: false, error: 'unreachable' })
  })
})

// Seed do orquestrador (mongo-init, config.example.yaml) grava `prompt` como
// lista, e a leitura tolerante a devolve assim; a escrita estrita só aceita
// texto (D-P2-06-9): o BFF une por "\n" e salva texto.
describe('prompt legado em lista (D-P2-06-9)', () => {
  it.each([
    [['Seja útil.'], 'Seja útil.'],
    [['Linha 1', 'Linha 2', 'Linha 3'], 'Linha 1\nLinha 2\nLinha 3']
  ])('lista e detalhe: %j vira o texto unido por quebra de linha', async (prompt, text) => {
    serveList([doc({ prompt })])
    serveItem('get', () => HttpResponse.json(doc({ prompt })))

    const list = await (await GET(new NextRequest(API))).json()
    const detail = await (await GET_BY_ID(new NextRequest(`${API}/x`), params('assistente'))).json()

    expect(list.data.data[0].prompt).toBe(text)
    expect(detail.data.prompt).toBe(text)
  })

  it.each([[['Linha 1']], [['Linha 1', 'Linha 2']]])(
    'PUT sobre o documento com prompt %j grava o texto do formulário',
    async (prompt) => {
      serveItem('get', () => HttpResponse.json(doc({ prompt })))
      serveItem('put', () => HttpResponse.json(doc({ prompt: 'Linha 1\nLinha 2', version: 4 })))

      const response = await PUT(
        jsonRequest(
          `${API}/assistente`,
          'PUT',
          { ...formBody, id: undefined, prompt: 'Linha 1\nLinha 2' },
          { 'If-Match': '"3"' }
        ),
        params('assistente')
      )

      expect(response.status).toBe(200)
      expect((seen[1].body as { prompt: unknown }).prompt).toBe('Linha 1\nLinha 2')
    }
  )

  it('item em formato desconhecido derruba a lista (502 invalid_response, D-P2-06-10)', async () => {
    serveList([stored, doc({ id: 'quebrado', prompt: { texto: 'x' } })])

    const response = await GET(new NextRequest(API))

    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({ success: false, error: 'invalid_response' })
  })
})

describe('GET /api/agents/[id]', () => {
  it('lê o documento pelo id codificado e devolve no formato do formulário', async () => {
    serveItem('get', () => HttpResponse.json(stored, { headers: { ETag: '"3"' } }))

    const response = await GET_BY_ID(new NextRequest(`${API}/x`), params('agente alfa'))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ success: true, data: asForm })
    expect(seen).toMatchObject([{ method: 'GET', path: '/admin/config/agents/agente%20alfa', auth: ADMIN }])
  })

  // O Next 15.2 entrega o param do route handler já decodificado: decodificar
  // de novo faria o editor de `a%41` ler (e excluir) o `aA` (review P2-06, R1).
  it('id com `%` literal vai codificado uma vez só (a%41 ⇒ a%2541)', async () => {
    serveItem('get', () => HttpResponse.json(doc({ id: 'a%41' })))
    serveItem('delete', () => new HttpResponse(null, { status: 204 }))

    await GET_BY_ID(new NextRequest(`${API}/x`), params('a%41'))
    await DELETE(
      new NextRequest(`${API}/x`, { method: 'DELETE', headers: { 'If-Match': '"3"' } }),
      params('a%41')
    )

    expect(seen.map((s) => s.path)).toEqual([
      '/admin/config/agents/a%2541',
      '/admin/config/agents/a%2541?hard=true'
    ])
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
})

describe('POST /api/agents', () => {
  it('cria com o documento snake_case (sem RAG ⇒ rag_config null) e devolve o criado', async () => {
    serveItem('post', () =>
      HttpResponse.json(doc({ id: 'novo', nome: 'Novo', version: 1 }), { status: 201 })
    )

    const response = await POST(jsonRequest(API, 'POST', formBody))

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.success).toBe(true)
    expect(body.data).toMatchObject({ id: 'novo', nome: 'Novo', version: 1 })
    expect(seen).toEqual([
      {
        method: 'POST',
        path: '/admin/config/agents',
        auth: ADMIN,
        ifMatch: null,
        body: {
          id: 'novo',
          nome: 'Novo',
          model: 'llama3.2',
          factory_ia_model: 'ollama',
          descricao: '',
          prompt: 'Olá',
          active: true,
          tools_ids: [],
          rag_config: null
        }
      }
    ])
  })

  it('traduz os campos novos para o documento, com o tipo dos parâmetros como vieram', async () => {
    serveItem('post', () => HttpResponse.json(doc({ id: 'novo' }), { status: 201 }))

    await POST(jsonRequest(API, 'POST', { ...formBody, ...newFields }))

    expect(seen[0].body).toMatchObject(newFields)
    expect((seen[0].body as { model_params: object }).model_params).toStrictEqual(
      newFields.model_params
    )
  })

  it('sem os campos novos, o documento criado não os traz (o orquestrador usa os defaults)', async () => {
    serveItem('post', () => HttpResponse.json(doc({ id: 'novo' }), { status: 201 }))

    await POST(jsonRequest(API, 'POST', { ...formBody, model_params: {} }))

    for (const key of Object.keys(newFields)) expect(seen[0].body).not.toHaveProperty(key)
  })

  it.each([
    ['parâmetro com valor objeto', { model_params: { stop: { a: 1 } } }],
    ['parâmetro com valor nulo', { model_params: { stop: null } }],
    ['num_history_runs fracionário', { num_history_runs: 1.5 }],
    ['markdown em texto', { markdown: 'sim' }],
    ['referência que não é texto', { api_key_ref: { $ne: null } }]
  ])('recusa %s com 400 sem chamar o orquestrador', async (_, patch) => {
    serveItem('post', () => HttpResponse.json(stored, { status: 201 }))

    const response = await POST(jsonRequest(API, 'POST', { ...formBody, ...patch }))

    expect(response.status).toBe(400)
    expect(seen).toEqual([])
  })

  it('texto da referência e da URL base vai sem espaços nas pontas; só em branco vira ausente', async () => {
    serveItem('post', () => HttpResponse.json(doc({ id: 'novo' }), { status: 201 }))

    await POST(
      jsonRequest(API, 'POST', { ...formBody, base_url: '  http://h/v1 ', api_key_ref: '   ' })
    )

    expect(seen[0].body).toMatchObject({ base_url: 'http://h/v1' })
    expect(seen[0].body).not.toHaveProperty('api_key_ref')
  })

  it('RAG ligado vira rag_config em snake_case', async () => {
    serveItem('post', () => HttpResponse.json(doc({ id: 'novo' }), { status: 201 }))

    await POST(
      jsonRequest(API, 'POST', {
        ...formBody,
        rag_active: true,
        rag_doc_name: 'manual',
        rag_model: 'text-embedding-3-small',
        rag_factoryIaModel: 'openai'
      })
    )

    expect(seen[0].body).toMatchObject({
      rag_config: {
        active: true,
        doc_name: 'manual',
        model: 'text-embedding-3-small',
        factory_ia_model: 'openai'
      }
    })
  })

  // Decisão 0006: o BFF valida o tipo; os valores aceitos são os do orquestrador.
  it('repassa factoryIaModel fora da lista do form (openai_compatible)', async () => {
    serveItem('post', () => HttpResponse.json(doc({ id: 'novo' }), { status: 201 }))

    await POST(jsonRequest(API, 'POST', { ...formBody, factoryIaModel: 'openai_compatible' }))

    expect(seen[0].body).toMatchObject({ factory_ia_model: 'openai_compatible' })
  })

  it.each([
    ['o corpo só com operador', { id: { $ne: null } }],
    ['operador no nome', { ...formBody, nome: { $gt: '' } }],
    ['JSON malformado', '{"id":']
  ])('recusa %s com 400 sem chamar o orquestrador', async (_, body) => {
    serveItem('post', () => HttpResponse.json(stored, { status: 201 }))

    const response = await POST(jsonRequest(API, 'POST', body))

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
    ['factory_ia_model', 'factoryIaModel'],
    ['nome', 'nome'],
    ['tools_ids', 'tools_ids'],
    ['rag_config', 'rag_active'],
    ['rag_config.doc_name', 'rag_doc_name'],
    ['rag_config.model', 'rag_model'],
    ['rag_config.factory_ia_model', 'rag_factoryIaModel'],
    ['model_params', 'model_params'],
    ['base_url', 'base_url'],
    ['api_key_ref', 'api_key_ref'],
    ['markdown', 'markdown'],
    ['add_history_to_context', 'add_history_to_context'],
    ['num_history_runs', 'num_history_runs'],
    ['add_datetime_to_context', 'add_datetime_to_context'],
    ['reasoning', 'reasoning'],
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
    ['campo fora do formulário', { detail: LEAK, field: 'rag_config.search_strategy' }],
    ['parâmetro por nome (o orquestrador não detalha)', { detail: LEAK, field: 'model_params.temperature' }],
    ['chave desconhecida', { detail: LEAK, field: 'unknown_key' }],
    ['propriedade de Object', { detail: LEAK, field: 'constructor' }],
    ['sem campo (não monta no runtime)', { detail: LEAK, error_type: 'ValueError' }]
  ])('422 com %s ⇒ 422 sem campo', async (_, body) => {
    serveItem('post', refusal(422, body))

    const response = await POST(jsonRequest(API, 'POST', formBody))

    expect(response.status).toBe(422)
    expect(await response.json()).toEqual({ success: false, error: 'invalid_config' })
  })
})

describe('PUT /api/agents/[id]', () => {
  const { id: _id, ...updateBody } = formBody
  void _id

  it('sobrescreve só os campos do formulário no documento atual, com o If-Match do browser', async () => {
    serveItem('get', () => HttpResponse.json(stored))
    serveItem('put', () => HttpResponse.json(doc({ nome: 'Renomeado', version: 4 })))

    const response = await PUT(
      jsonRequest(
        `${API}/assistente`,
        'PUT',
        {
          ...updateBody,
          ...newFields,
          nome: 'Renomeado',
          rag_active: true,
          rag_doc_name: 'outra',
          rag_model: 'embed-2',
          rag_factoryIaModel: 'openai'
        },
        { 'If-Match': '"3"' }
      ),
      params('assistente')
    )

    expect(response.status).toBe(200)
    expect((await response.json()).data).toMatchObject({ nome: 'Renomeado', version: 4 })
    expect(seen.map((s) => `${s.method} ${s.path}`)).toEqual([
      'GET /admin/config/agents/assistente',
      'PUT /admin/config/agents/assistente'
    ])
    const { version: _version, ...current } = stored
    void _version
    expect(seen[1]).toMatchObject({ auth: ADMIN, ifMatch: '"3"' })
    expect(seen[1].body).toEqual({
      ...current,
      ...newFields,
      nome: 'Renomeado',
      model: 'llama3.2',
      factory_ia_model: 'ollama',
      descricao: '',
      prompt: 'Olá',
      active: true,
      tools_ids: [],
      rag_config: {
        ...current.rag_config,
        active: true,
        doc_name: 'outra',
        model: 'embed-2',
        factory_ia_model: 'openai'
      }
    })
  })

  it('RAG desligado manda rag_config null e mantém o resto', async () => {
    serveItem('get', () => HttpResponse.json(stored))
    serveItem('put', () => HttpResponse.json(doc({ rag_config: null, version: 4 })))

    await PUT(
      jsonRequest(`${API}/assistente`, 'PUT', updateBody, { 'If-Match': '3' }),
      params('assistente')
    )

    expect(seen[1].ifMatch).toBe('"3"')
    expect(seen[1].body).toMatchObject({ rag_config: null })
  })

  // P3-02: os campos que o formulário cobre vêm do formulário; o que ele não
  // conhece (chave futura) segue do documento atual.
  it('campo coberto ausente do formulário sai do documento; chave desconhecida e RAG ficam', async () => {
    serveItem('get', () => HttpResponse.json({ ...stored, base_url: 'http://velha/v1', future_key: 'fica' }))
    serveItem('put', () => HttpResponse.json(doc({ version: 4 })))

    await PUT(
      jsonRequest(
        `${API}/assistente`,
        'PUT',
        {
          ...updateBody,
          model_params: {},
          base_url: '',
          api_key_ref: '',
          rag_active: true,
          rag_doc_name: 'base',
          rag_model: 'embed-1',
          rag_factoryIaModel: 'ollama'
        },
        { 'If-Match': '"3"' }
      ),
      params('assistente')
    )

    const body = seen[1].body as Record<string, unknown>
    for (const key of [
      'model_params',
      'base_url',
      'api_key_ref',
      'markdown',
      'add_history_to_context',
      'num_history_runs',
      'add_datetime_to_context',
      'reasoning',
      'user_memory_active',
      'summary_active'
    ])
      expect(body).not.toHaveProperty(key)
    expect(body).toMatchObject({
      future_key: 'fica',
      rag_config: { search_strategy: 'hierarchical', doc_name: 'base' }
    })
  })

  it.each([
    ['sem If-Match', {}],
    ['If-Match que não é versão', { 'If-Match': 'W/"abc"' }],
    ['If-Match vazio', { 'If-Match': '""' }]
  ])('%s ⇒ 400 sem chamar o orquestrador', async (_, headers) => {
    serveItem('get', () => HttpResponse.json(stored))

    const response = await PUT(
      jsonRequest(`${API}/assistente`, 'PUT', updateBody, headers),
      params('assistente')
    )

    expect(response.status).toBe(400)
    expect(seen).toEqual([])
  })

  it('operador no corpo ⇒ 400 sem chamar o orquestrador', async () => {
    serveItem('get', () => HttpResponse.json(stored))

    const response = await PUT(
      jsonRequest(`${API}/assistente`, 'PUT', { ...updateBody, tools_ids: { $ne: null } }, { 'If-Match': '"3"' }),
      params('assistente')
    )

    expect(response.status).toBe(400)
    expect(seen).toEqual([])
  })

  it('versão divergente (412) ⇒ 412 version_conflict', async () => {
    serveItem('get', () => HttpResponse.json(stored))
    serveItem('put', refusal(412))

    const response = await PUT(
      jsonRequest(`${API}/assistente`, 'PUT', updateBody, { 'If-Match': '"2"' }),
      params('assistente')
    )

    expect(response.status).toBe(412)
    expect(await response.json()).toEqual({ success: false, error: 'version_conflict' })
    expect(seen[1].ifMatch).toBe('"2"')
  })

  it('agent que sumiu ⇒ 404 sem PUT', async () => {
    serveItem('get', refusal(404))

    const response = await PUT(
      jsonRequest(`${API}/assistente`, 'PUT', updateBody, { 'If-Match': '"3"' }),
      params('assistente')
    )

    expect(response.status).toBe(404)
    expect(seen.map((s) => s.method)).toEqual(['GET'])
  })

  it('422 no PUT também vira o campo do formulário', async () => {
    serveItem('get', () => HttpResponse.json(stored))
    serveItem('put', refusal(422, { detail: LEAK, field: 'model' }))

    const response = await PUT(
      jsonRequest(`${API}/assistente`, 'PUT', updateBody, { 'If-Match': '"3"' }),
      params('assistente')
    )

    expect(response.status).toBe(422)
    expect(await response.json()).toEqual({ success: false, error: 'invalid_config', field: 'model' })
  })
})

describe('DELETE /api/agents/[id]', () => {
  const del = (id: string, headers: Record<string, string> = { 'If-Match': '"3"' }) =>
    DELETE(new NextRequest(`${API}/${id}`, { method: 'DELETE', headers }), params(id))

  it('exclui de vez (hard=true) com o If-Match do browser', async () => {
    serveItem('delete', () => new HttpResponse(null, { status: 204 }))

    const response = await del('assistente')

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ success: true })
    expect(seen).toEqual([
      {
        method: 'DELETE',
        path: '/admin/config/agents/assistente?hard=true',
        auth: ADMIN,
        ifMatch: '"3"'
      }
    ])
  })

  // D-P3-04-2: o BFF repassa só os ids dos teams (lista de strings), nada mais
  // do corpo do orquestrador.
  it('agent membro de teams (409) ⇒ 409 conflict com só os ids dos teams', async () => {
    serveItem(
      'delete',
      refusal(409, { detail: LEAK, used_by: { teams: ['suporte', 'vendas'], agents: ['outro'], extra: LEAK } })
    )

    const response = await del('assistente')

    expect(response.status).toBe(409)
    const text = await response.text()
    expect(JSON.parse(text)).toEqual({
      success: false,
      error: 'conflict',
      used_by: { teams: ['suporte', 'vendas'] }
    })
    expect(text).not.toMatch(/detalhe-interno|outro/)
  })

  it.each([
    ['sem used_by', { detail: LEAK }],
    ['used_by.teams que não é lista de texto', { detail: LEAK, used_by: { teams: [1, { a: 1 }] } }],
    ['used_by.teams vazio', { detail: LEAK, used_by: { teams: [] } }]
  ])('409 %s ⇒ 409 conflict sem lista', async (_, body) => {
    serveItem('delete', refusal(409, body))

    const response = await del('assistente')

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ success: false, error: 'conflict' })
  })

  it('412 ⇒ 412 version_conflict', async () => {
    serveItem('delete', refusal(412))

    const response = await del('assistente')

    expect(response.status).toBe(412)
  })

  it('sem If-Match ⇒ 400 sem chamar o orquestrador', async () => {
    serveItem('delete', () => new HttpResponse(null, { status: 204 }))

    const response = await del('assistente', {})

    expect(response.status).toBe(400)
    expect(seen).toEqual([])
  })

  it('chave recusada pelo orquestrador (401) ⇒ 502 unauthorized', async () => {
    serveItem('delete', refusal(401))

    const response = await del('assistente')

    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({ success: false, error: 'unauthorized' })
  })
})
