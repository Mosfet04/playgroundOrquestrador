// @vitest-environment node
import { http, HttpResponse } from 'msw'
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { GET as agentHistory } from '@/app/api/agents/[id]/history/route'
import { POST as agentRestore } from '@/app/api/agents/[id]/history/[version]/restore/route'
import { GET as teamHistory } from '@/app/api/teams/[id]/history/route'
import { GET as toolHistory } from '@/app/api/tools/[id]/history/route'

import { TEST_ENV } from '../../../e2e/test-env'
import { server } from '../../msw/server'

// QA do P4-04: o que a suíte do dev (configHistory.test.ts) não alcança. Id
// hostil no path, campo extra do orquestrador, fronteiras de limit/versão,
// formas do If-Match e data que passa o schema mas não existe.

const BASE = TEST_ENV.ORCHESTRATOR_URL
const LEAK = 'LEAK-valor-que-nunca-sai'

const agentDoc = {
  id: 'assistente',
  nome: 'Assistente',
  factory_ia_model: 'openai',
  model: 'gpt-4o',
  prompt: 'Seja útil.',
  active: true
}
const teamDoc = {
  id: 'suporte',
  nome: 'Suporte',
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
  headers: { 'X-Ref': 'env:CLIMA_API_KEY' },
  active: true
}

const entryOf = (document: object | null, diff: object = {}, extra: object = {}) => ({
  version: 3,
  actor: 'admin',
  at: '2026-11-14T17:32:00+00:00',
  diff,
  document,
  ...extra
})

let paths: string[] = []
const serve = (kind: string, tail: string, method: 'get' | 'post', respond: () => Response) =>
  server.use(
    http[method](`${BASE}/admin/config/${kind}/:id/${tail}`, ({ request }) => {
      const url = new URL(request.url)
      paths.push(`${request.method} ${url.pathname}${url.search} if-match=${request.headers.get('if-match')}`)
      return respond()
    })
  )

const get = (url: string) => new NextRequest(`http://playground.test${url}`)
const idParams = (id: string) => ({ params: Promise.resolve({ id }) })
const post = (version: string, ifMatch?: string) =>
  new NextRequest(`http://playground.test/api/x/y/history/${version}/restore`, {
    method: 'POST',
    headers: ifMatch === undefined ? {} : { 'If-Match': ifMatch }
  })
const versionParams = (id: string, version: string) => ({ params: Promise.resolve({ id, version }) })

beforeEach(() => {
  paths = []
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

describe('QA P4-04 BFF: id hostil no histórico', () => {
  // Next entrega o id já decodificado; o BFF o codifica de novo no path do
  // orquestrador. Nenhum id muda a estrutura do path (`/kind/<id>/history`).
  it.each(['a/b', 'a/../b', 'x\\y', '.'])('id %j ⇒ 400 e nada é chamado', async (id) => {
    serve('agents', 'history', 'get', () => HttpResponse.json({ items: [], total: 0 }))

    const response = await agentHistory(get('/api/agents/x/history'), idParams(id))

    expect(response.status).toBe(400)
    expect(paths).toEqual([])
  })

  it.each(['café ☕', 'x?admin=1', 'x#y', 'a%41', '%2e%2e'])(
    'id %j é codificado no path e a resposta é 200',
    async (id) => {
      serve('agents', 'history', 'get', () => HttpResponse.json({ items: [], total: 0 }))

      const response = await agentHistory(get('/api/agents/x/history'), idParams(id))

      expect(response.status).toBe(200)
      expect(paths).toEqual([
        `GET /admin/config/agents/${encodeURIComponent(id)}/history?offset=0&limit=20 if-match=null`
      ])
    }
  )
})

describe('QA P4-04 BFF: campo extra do orquestrador não chega ao browser', () => {
  const extra = { internal_token: LEAK, api_key: LEAK }
  const cases = [
    ['agents', agentHistory, agentDoc],
    ['teams', teamHistory, teamDoc],
    ['tools', toolHistory, toolDoc]
  ] as const

  it.each(cases)('%s: documento, diff e entrada com campo extra ficam de fora', async (kind, history, doc) => {
    serve(kind, 'history', 'get', () =>
      HttpResponse.json({
        items: [
          entryOf(
            { ...doc, ...extra },
            // O `before` de um campo que o documento não declara vira o anterior.
            { internal_token: { before: LEAK, after: null }, nome: { before: 'Antigo', after: 'Novo' } },
            extra
          )
        ],
        total: 1
      })
    )

    const response = await history(get(`/api/${kind}/x/history`), idParams('x'))

    expect(response.status).toBe(200)
    expect(await response.text()).not.toContain(LEAK)
  })
})

describe('QA P4-04 BFF: fronteiras de paginação aceitas', () => {
  it.each([
    ['?limit=1', 'offset=0&limit=1'],
    ['?limit=200', 'offset=0&limit=200'],
    ['?offset=0&limit=20', 'offset=0&limit=20'],
    ['?offset=1000000000', 'offset=1000000000&limit=20'],
    ['?limit=5&limit=6', 'offset=0&limit=6']
  ])('%s é repassado como %s', async (query, forwarded) => {
    serve('agents', 'history', 'get', () => HttpResponse.json({ items: [], total: 0 }))

    const response = await agentHistory(get(`/api/agents/x/history${query}`), idParams('x'))

    expect(response.status).toBe(200)
    expect(paths).toEqual([`GET /admin/config/agents/x/history?${forwarded} if-match=null`])
  })

  it.each(['?limit=1e3', '?limit=%201', '?limit=+5', '?offset=0x10', '?limit=٣', '?offset=1000000001'])(
    'limit/offset %s ⇒ 400',
    async (query) => {
      const response = await agentHistory(get(`/api/agents/x/history${query}`), idParams('x'))

      expect(response.status).toBe(400)
      expect(paths).toEqual([])
    }
  )

  it('o orquestrador devolve mais itens que o limit pedido ⇒ resposta fora do contrato', async () => {
    serve('agents', 'history', 'get', () =>
      HttpResponse.json({ items: [entryOf(agentDoc), entryOf(agentDoc)], total: 2 })
    )

    const response = await agentHistory(get('/api/agents/x/history?limit=1'), idParams('x'))

    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({ success: false, error: 'invalid_response' })
  })
})

describe('QA P4-04 BFF: restaurar, versão e If-Match', () => {
  it.each([
    ['0', '"8"', '/history/0/restore'],
    ['007', '"8"', '/history/7/restore'],
    ['999999999999999', '"8"', '/history/999999999999999/restore']
  ])('versão %s é repassada normalizada (o orquestrador decide 404)', async (version, ifMatch, tail) => {
    serve('agents', 'history/:version/restore', 'post', () =>
      HttpResponse.json({ detail: 'x' }, { status: 404 })
    )

    const response = await agentRestore(post(version, ifMatch), versionParams('a', version))

    expect(response.status).toBe(404)
    expect(paths).toEqual([`POST /admin/config/agents/a${tail} if-match="8"`])
  })

  it.each(['W/"8"', '"8', '8"', '""8""', '8, 9', '8 9', '-8', '+8', '8.0', '1e3', "'8'", '', '"1234567890123456"'])(
    'If-Match %j ⇒ 400 sem chamar o orquestrador',
    async (ifMatch) => {
      const response = await agentRestore(post('5', ifMatch), versionParams('a', '5'))

      expect(response.status).toBe(400)
      expect(paths).toEqual([])
    }
  )

  it.each([
    ['8', '"8"'],
    ['"0"', '"0"']
  ])('If-Match %s é aceito e repassado como %s', async (ifMatch, forwarded) => {
    serve('agents', 'history/:version/restore', 'post', () => HttpResponse.json({}, { status: 412 }))

    const response = await agentRestore(post('5', ifMatch), versionParams('a', '5'))

    expect(response.status).toBe(412)
    expect(paths).toEqual([`POST /admin/config/agents/a/history/5/restore if-match=${forwarded}`])
  })

  it.each(['5 ', ' 5', '٥', '5/../x', '5%2F', '0x5', '5e0', '+5', '1234567890123456'])(
    'versão %j no path ⇒ 400',
    async (version) => {
      const response = await agentRestore(post('5', '"8"'), versionParams('a', version))

      expect(response.status).toBe(400)
      expect(paths).toEqual([])
    }
  )
})

describe('QA P4-04 BFF: data da entrada', () => {
  it.each(['2026-02-30T00:00:00Z', '2026-13-01T00:00:00Z', '2026-11-14T24:00:00Z'])(
    'data impossível %s não passa para a tela (new Date().toISOString() quebraria o Sheet)',
    async (at) => {
      serve('agents', 'history', 'get', () =>
        HttpResponse.json({ items: [entryOf(agentDoc, {}, { at })], total: 1 })
      )

      const response = await agentHistory(get('/api/agents/x/history'), idParams('x'))

      expect(response.status).toBe(502)
    }
  )

  it('Python sem microssegundos e com ±HH:MM é aceita', async () => {
    serve('agents', 'history', 'get', () =>
      HttpResponse.json({
        items: [entryOf(agentDoc, {}, { at: '2026-11-14T17:32:00-03:00' }), entryOf(agentDoc, {}, { at: '2026-11-14T17:32:00.5+00:00' })],
        total: 2
      })
    )

    const response = await agentHistory(get('/api/agents/x/history'), idParams('x'))

    expect(response.status).toBe(200)
  })
})
