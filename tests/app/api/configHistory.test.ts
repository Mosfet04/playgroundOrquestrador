// @vitest-environment node
import { http, HttpResponse } from 'msw'
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { GET as agentHistory } from '@/app/api/agents/[id]/history/route'
import { POST as agentRestore } from '@/app/api/agents/[id]/history/[version]/restore/route'
import { GET as teamHistory } from '@/app/api/teams/[id]/history/route'
import { POST as teamRestore } from '@/app/api/teams/[id]/history/[version]/restore/route'
import { GET as toolHistory } from '@/app/api/tools/[id]/history/route'
import { POST as toolRestore } from '@/app/api/tools/[id]/history/[version]/restore/route'

import { TEST_ENV } from '../../../e2e/test-env'
import { server } from '../../msw/server'

// P4-04: histórico e restaurar pela API Admin (FA-05, admin_config.py), com a
// chave admin. O documento de cada entrada vem no formato do formulário, com o
// anterior refeito do `diff` (o orquestrador manda só os campos que mudaram);
// header em texto nunca sai do BFF. Restaurar leva a versão lida no If-Match e
// volta como o PUT (documento e revisão do runtime). Sessão e Origin:
// tests/middleware.test.ts.

const BASE = TEST_ENV.ORCHESTRATOR_URL
const ADMIN = `Bearer ${TEST_ENV.ORCHESTRATOR_API_KEY_ADMIN}`
const LEAK = 'detalhe-interno-do-orquestrador'
const SECRET = 'Bearer valor-secreto-do-header'

// Documentos como o histórico os mostra (entity_document, sem `version`).
const agentDoc = {
  id: 'assistente',
  nome: 'Assistente',
  factory_ia_model: 'openai',
  model: 'gpt-4o',
  descricao: '',
  prompt: 'Seja útil.',
  tools_ids: [],
  rag_config: null,
  active: true,
  model_params: { temperature: 0.2 },
  api_key_ref: 'env:OPENAI_API_KEY'
}
const teamDoc = {
  id: 'suporte',
  nome: 'Suporte',
  descricao: '',
  prompt: '',
  member_ids: ['assistente'],
  mode: 'route',
  factory_ia_model: 'openai',
  model: 'gpt-4o',
  active: true
}
const toolDoc = {
  id: 'clima',
  name: 'Clima',
  description: 'Previsão',
  route: 'https://api.clima.test/v1',
  http_method: 'GET',
  parameters: [],
  instructions: null,
  headers: { Authorization: '***', 'X-Ref': 'env:CLIMA_API_KEY' },
  active: true
}

const KINDS = [
  {
    kind: 'agents',
    id: 'assistente',
    history: agentHistory,
    restore: agentRestore,
    doc: agentDoc,
    // Campo de topo que mudou: modelo (antes gpt-4o-mini).
    change: { model: { before: 'gpt-4o-mini', after: 'gpt-4o' } },
    expectAfter: { id: 'assistente', nome: 'Assistente', model: 'gpt-4o', factoryIaModel: 'openai', version: 3 },
    expectBefore: { model: 'gpt-4o-mini', version: 3 },
    // Campo opcional que passou a existir nesta versão e como o anterior o mostra.
    added: { field: 'api_key_ref', absent: undefined }
  },
  {
    kind: 'teams',
    id: 'suporte',
    history: teamHistory,
    restore: teamRestore,
    doc: teamDoc,
    change: { mode: { before: 'coordinate', after: 'route' } },
    expectAfter: { id: 'suporte', mode: 'route', factoryIaModel: 'openai', version: 3 },
    expectBefore: { mode: 'coordinate', version: 3 },
    added: { field: 'descricao', absent: '' }
  },
  {
    kind: 'tools',
    id: 'clima',
    history: toolHistory,
    restore: toolRestore,
    doc: toolDoc,
    change: { description: { before: 'Antiga', after: 'Previsão' } },
    expectAfter: { id: 'clima', description: 'Previsão', instructions: '', version: 3 },
    expectBefore: { description: 'Antiga', version: 3 },
    added: { field: 'instructions', absent: '' }
  }
] as const

type Seen = { method: string; path: string; auth: string | null; ifMatch: string | null }
let seen: Seen[] = []

const record = (request: Request) => {
  const url = new URL(request.url)
  seen.push({
    method: request.method,
    path: `${url.pathname}${url.search}`,
    auth: request.headers.get('authorization'),
    ifMatch: request.headers.get('if-match')
  })
}

const entry = (version: number, diff: object, document: object | null, extra: object = {}) => ({
  version,
  actor: 'admin',
  at: '2026-11-14T17:32:00.123456+00:00',
  diff,
  document,
  ...extra
})

function serveHistory(kind: string, respond: () => Response) {
  server.use(
    http.get(`${BASE}/admin/config/${kind}/:id/history`, ({ request }) => {
      record(request)
      return respond()
    })
  )
}

function serveRestore(kind: string, respond: () => Response) {
  server.use(
    http.post(`${BASE}/admin/config/${kind}/:id/history/:version/restore`, ({ request }) => {
      record(request)
      return respond()
    })
  )
}

const page = (items: object[], total = items.length) =>
  HttpResponse.json({ items, total, offset: 0, limit: 20 })

const refusal = (status: number, body: object = { detail: LEAK }) => () =>
  HttpResponse.json(body, { status })

const historyRequest = (kind: string, id: string, query = '') =>
  new NextRequest(`http://playground.test/api/${kind}/${id}/history${query}`)

const restoreRequest = (kind: string, id: string, version: string, ifMatch?: string) =>
  new NextRequest(`http://playground.test/api/${kind}/${id}/history/${version}/restore`, {
    method: 'POST',
    headers: ifMatch === undefined ? {} : { 'If-Match': ifMatch }
  })

const idParams = (id: string) => ({ params: Promise.resolve({ id }) })
const versionParams = (id: string, version: string) => ({ params: Promise.resolve({ id, version }) })

beforeEach(() => {
  seen = []
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

describe.each(KINDS)('GET /api/$kind/[id]/history', ({ kind, id, history, doc, change, expectAfter, expectBefore, added }) => {
  it('pede a página com a chave admin e devolve cada versão no formato do formulário, com a anterior', async () => {
    serveHistory(kind, () => page([entry(3, change, doc)], 7))

    const response = await history(historyRequest(kind, id, '?offset=20&limit=20'), idParams(id))

    expect(response.status).toBe(200)
    expect(seen).toEqual([
      {
        method: 'GET',
        path: `/admin/config/${kind}/${id}/history?offset=20&limit=20`,
        auth: ADMIN,
        ifMatch: null
      }
    ])
    const { success, data } = await response.json()
    expect(success).toBe(true)
    expect(data).toMatchObject({ total: 7, offset: 20, limit: 20 })
    expect(data.items).toHaveLength(1)
    expect(data.items[0]).toMatchObject({
      version: 3,
      actor: 'admin',
      at: '2026-11-14T17:32:00.123456+00:00',
      document: expectAfter,
      previous: expectBefore
    })
    // O `diff` cru do orquestrador não passa (o browser compara os documentos).
    expect(data.items[0]).not.toHaveProperty('diff')
  })

  it('sem query: 1ª página de 20', async () => {
    serveHistory(kind, () => page([]))

    await history(historyRequest(kind, id), idParams(id))

    expect(seen[0].path).toBe(`/admin/config/${kind}/${id}/history?offset=0&limit=20`)
  })

  it('criação (o `id` está no diff): sem anterior; remoção: sem documento nem anterior', async () => {
    const created = Object.fromEntries(Object.entries(doc).map(([name, value]) => [name, { before: null, after: value }]))
    const removed = Object.fromEntries(Object.entries(doc).map(([name, value]) => [name, { before: value, after: null }]))
    serveHistory(kind, () => page([entry(4, removed, null), entry(1, created, doc)]))

    const { data } = await (await history(historyRequest(kind, id), idParams(id))).json()

    expect(data.items[0]).toMatchObject({ version: 4, document: null, previous: null })
    expect(data.items[1]).toMatchObject({ version: 1, previous: null })
    expect(data.items[1].document).toMatchObject({ id, version: 1 })
  })

  it('campo que não existia antes (`before: null`) fica ausente na anterior', async () => {
    serveHistory(kind, () =>
      page([entry(2, { [added.field]: { before: null, after: 'env:NOVO_API_KEY' } }, { ...doc, [added.field]: 'env:NOVO_API_KEY' })])
    )

    const { data } = await (await history(historyRequest(kind, id), idParams(id))).json()

    expect(data.items[0].document[added.field]).toBe('env:NOVO_API_KEY')
    expect(data.items[0].previous).toMatchObject({ id })
    expect(data.items[0].previous[added.field]).toBe(added.absent)
  })

  it('store YAML (sem diário): lista vazia', async () => {
    serveHistory(kind, () => page([]))

    const response = await history(historyRequest(kind, id), idParams(id))

    expect(await response.json()).toEqual({ success: true, data: { items: [], total: 0, offset: 0, limit: 20 } })
  })

  it.each([
    '?offset=-1',
    '?offset=abc',
    '?offset=1.5',
    '?limit=0',
    '?limit=201',
    '?limit=',
    '?offset=99999999999'
  ])('paginação inválida (%s) ⇒ 400 sem chamar o orquestrador', async (query) => {
    const response = await history(historyRequest(kind, id, query), idParams(id))

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ success: false, error: 'invalid_request' })
    expect(seen).toEqual([])
  })

  it('id vazio ⇒ 400; `..` não sai do BFF', async () => {
    expect((await history(historyRequest(kind, 'x'), idParams(''))).status).toBe(400)
    expect((await history(historyRequest(kind, 'x'), idParams('..'))).status).toBe(400)
    expect(seen).toEqual([])
  })

  it.each([
    ['fora do ar', () => HttpResponse.error(), 503, 'unreachable'],
    ['5xx', refusal(500), 502, 'server_error'],
    ['422 (faixa)', refusal(422), 502, 'rejected'],
    ['resposta fora do contrato', () => HttpResponse.json({ items: [{ version: 'x' }], total: 1 }), 502, 'invalid_response'],
    ['documento fora do schema', () => page([entry(3, change, { id })]), 502, 'invalid_response'],
    ['data que não é ISO', () => page([entry(3, change, doc, { at: 'ontem' })]), 502, 'invalid_response']
  ])('%s ⇒ %i %s, sem o detalhe', async (_, respond, status, error) => {
    serveHistory(kind, respond)

    const response = await history(historyRequest(kind, id), idParams(id))

    expect(response.status).toBe(status)
    const text = await response.text()
    expect(JSON.parse(text)).toEqual({ success: false, error })
    expect(text).not.toContain(LEAK)
  })
})

describe('GET /api/tools/[id]/history: nenhum valor de header', () => {
  it('header em texto vira `***` no documento e no anterior, mesmo se o orquestrador o mandasse em claro', async () => {
    const leaked = { ...toolDoc, headers: { Authorization: SECRET, 'X-Ref': 'env:CLIMA_API_KEY', 'X-Ruim': 'env:minusculo' } }
    serveHistory('tools', () =>
      page([entry(3, { headers: { before: { Authorization: `${SECRET}-antigo` }, after: leaked.headers } }, leaked)])
    )

    const response = await toolHistory(historyRequest('tools', 'clima'), idParams('clima'))

    const text = await response.text()
    expect(text).not.toContain('valor-secreto')
    expect(text).not.toContain('env:minusculo')
    const { data } = JSON.parse(text)
    expect(data.items[0].document.headers).toEqual({ Authorization: '***', 'X-Ref': 'env:CLIMA_API_KEY', 'X-Ruim': '***' })
    expect(data.items[0].previous.headers).toEqual({ Authorization: '***' })
  })
})

describe.each(KINDS)('POST /api/$kind/[id]/history/[version]/restore', ({ kind, id, restore, doc }) => {
  const restored = { ...doc, version: 9 }

  it('restaura com a chave admin e o If-Match lido; devolve o documento novo e a revisão do runtime', async () => {
    serveRestore(kind, () =>
      HttpResponse.json(restored, { headers: { ETag: '"9"', 'Runtime-Revision': '12' } })
    )

    const response = await restore(restoreRequest(kind, id, '5', '"8"'), versionParams(id, '5'))

    expect(response.status).toBe(200)
    expect(seen).toEqual([
      { method: 'POST', path: `/admin/config/${kind}/${id}/history/5/restore`, auth: ADMIN, ifMatch: '"8"' }
    ])
    const body = await response.json()
    expect(body).toMatchObject({ success: true, runtimeRevision: 12, data: { id, version: 9 } })
  })

  it.each([
    ['sem If-Match', '5', undefined],
    ['If-Match que não é versão', '5', '"oito"'],
    ['versão que não é inteiro', 'v5', '"8"'],
    ['versão negativa', '-5', '"8"'],
    ['versão vazia', '', '"8"']
  ])('%s ⇒ 400 sem chamar o orquestrador', async (_, version, ifMatch) => {
    const response = await restore(restoreRequest(kind, id, version || 'x', ifMatch), versionParams(id, version))

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ success: false, error: 'invalid_request' })
    expect(seen).toEqual([])
  })

  it.each([
    ['412 (versão divergente)', refusal(412), 412, { error: 'version_conflict' }],
    ['404 (versão fora do histórico)', refusal(404), 404, { error: 'not_found' }],
    [
      '409 (store YAML somente leitura)',
      refusal(409, { detail: 'O store de configuração é somente leitura' }),
      409,
      { error: 'conflict' }
    ],
    [
      '422 que não monta no runtime',
      refusal(422, { detail: LEAK, error_type: 'ValueError' }),
      422,
      { error: 'not_applied', errorType: 'ValueError' }
    ],
    ['5xx (pode ter gravado)', refusal(500), 502, { error: 'not_confirmed' }]
  ])('%s ⇒ %i, sem o detalhe', async (_, respond, status, body) => {
    serveRestore(kind, respond)

    const response = await restore(restoreRequest(kind, id, '5', '"8"'), versionParams(id, '5'))

    expect(response.status).toBe(status)
    const text = await response.text()
    expect(JSON.parse(text)).toEqual({ success: false, ...body })
    expect(text).not.toContain(LEAK)
  })
})

describe('POST restore: 422 com campo', () => {
  it('agent: o campo do documento vira o do formulário', async () => {
    serveRestore('agents', refusal(422, { detail: LEAK, field: 'factory_ia_model' }))

    const response = await agentRestore(restoreRequest('agents', 'assistente', '5', '8'), versionParams('assistente', '5'))

    expect(response.status).toBe(422)
    expect(await response.json()).toEqual({ success: false, error: 'invalid_config', field: 'factoryIaModel' })
  })

  it('tool: header mascarado sem valor gravado ⇒ campo `headers`', async () => {
    serveRestore('tools', refusal(422, { detail: LEAK, field: 'headers' }))

    const response = await toolRestore(restoreRequest('tools', 'clima', '5', '8'), versionParams('clima', '5'))

    expect(await response.json()).toEqual({ success: false, error: 'invalid_config', field: 'headers' })
  })
})
