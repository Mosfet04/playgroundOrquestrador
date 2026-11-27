// @vitest-environment node
import { http, HttpResponse } from 'msw'
import { NextRequest } from 'next/server'
import { describe, expect, it } from 'vitest'

import { GET as AGENT_BY_ID, PUT as AGENT_PUT } from '@/app/api/agents/[id]/route'
import { GET as AGENTS, POST as AGENT_POST } from '@/app/api/agents/route'
import { GET as TEAM_BY_ID, PUT as TEAM_PUT } from '@/app/api/teams/[id]/route'
import { GET as TEAMS } from '@/app/api/teams/route'
import { GET as TOOL_BY_ID, PUT as TOOL_PUT } from '@/app/api/tools/[id]/route'
import { GET as TOOLS } from '@/app/api/tools/route'

import { TEST_ENV } from '../../../e2e/test-env'
import { server } from '../../msw/server'

// QA1-09 (FA-08): o orquestrador devolve `updated_at` (ISO 8601 UTC com `Z`, ou
// `null` sem o campo) em todo documento de /admin/config/*; o BFF o leva à lista
// da coluna "Atualizado". Valor que não é data não derruba o documento: sai sem
// data (a lista mostra "—"). Na escrita o campo não volta: é metadado, como a
// `version`.

const BASE = TEST_ENV.ORCHESTRATOR_URL
const SAVED = '2026-11-26T14:03:00Z'

const documents = {
  agents: {
    id: 'a1',
    nome: 'Agente',
    model: 'llama3.2',
    factory_ia_model: 'ollama',
    prompt: 'Olá',
    active: true,
    version: 2
  },
  teams: {
    id: 't1',
    nome: 'Time',
    prompt: 'Olá',
    active: true,
    member_ids: ['a1'],
    mode: 'coordinate',
    factory_ia_model: 'ollama',
    model: 'llama3.2',
    version: 2
  },
  tools: {
    id: 'x1',
    name: 'Tool',
    description: 'Tool',
    route: 'https://example.test/x',
    http_method: 'GET',
    parameters: [],
    active: true,
    version: 2
  }
}

type Kind = keyof typeof documents
type Handler = (request: NextRequest) => Promise<Response>

const readers: Record<Kind, { list: Handler; byId: (request: NextRequest) => Promise<Response> }> = {
  agents: { list: AGENTS, byId: (r) => AGENT_BY_ID(r, params('a1')) },
  teams: { list: TEAMS, byId: (r) => TEAM_BY_ID(r, params('t1')) },
  tools: { list: TOOLS, byId: (r) => TOOL_BY_ID(r, params('x1')) }
}
const params = (id: string) => ({ params: Promise.resolve({ id }) })
const kinds = Object.keys(documents) as Kind[]

// Corpos de formulário mínimos e válidos de cada tipo.
const bodies: Record<Kind, object> = {
  agents: { nome: 'Agente', model: 'llama3.2', factoryIaModel: 'ollama', prompt: 'Olá', rag_active: false },
  teams: { nome: 'Time', factoryIaModel: 'ollama', model: 'llama3.2', member_ids: ['a1'], mode: 'coordinate' },
  tools: { name: 'Tool', description: 'Tool', route: 'https://example.test/x', http_method: 'GET' }
}

const serveDocument = (kind: Kind, patch: Record<string, unknown>) => {
  const document = { ...documents[kind], ...patch }
  server.use(
    http.get(`${BASE}/admin/config/${kind}`, () =>
      HttpResponse.json({ items: [document], total: 1, offset: 0, limit: 200 })
    ),
    http.get(`${BASE}/admin/config/${kind}/:id`, () => HttpResponse.json(document))
  )
}

const listed = async (kind: Kind) => (await (await readers[kind].list(new NextRequest(`http://playground.test/api/${kind}`))).json()).data.data[0]
const fetched = async (kind: Kind) => (await (await readers[kind].byId(new NextRequest(`http://playground.test/api/${kind}/x`))).json()).data

describe.each(kinds)('updated_at em /api/%s', (kind) => {
  it('a data do orquestrador chega à lista e ao GET por id', async () => {
    serveDocument(kind, { updated_at: SAVED })

    expect((await listed(kind)).updated_at).toBe(SAVED)
    expect((await fetched(kind)).updated_at).toBe(SAVED)
  })

  it.each([
    ['null (store YAML, legado do seed)', { updated_at: null }],
    ['ausente (documento do histórico)', {}]
  ])('%s: sem data, e o documento segue na lista', async (_name, patch) => {
    serveDocument(kind, patch)

    const item = await listed(kind)
    expect(item.id).toBe(documents[kind].id)
    expect(item.updated_at).toBeUndefined()
  })

  it.each(['ontem', '2026-13-45T99:00:00Z', '2026-11-26 14:03:00', 20261126, ''])(
    'valor que não é data (%j): o documento segue na lista, sem data',
    async (updatedAt) => {
      serveDocument(kind, { updated_at: updatedAt })

      const item = await listed(kind)
      expect(item.id).toBe(documents[kind].id)
      expect(item.updated_at).toBeUndefined()
    }
  )
})

describe('escrita: o updated_at lido não volta no corpo do PUT', () => {
  const put = { agents: AGENT_PUT, teams: TEAM_PUT, tools: TOOL_PUT }
  it.each(kinds)('%s', async (kind) => {
    const sent: unknown[] = []
    const document = { ...documents[kind], updated_at: SAVED }
    server.use(
      http.get(`${BASE}/admin/config/${kind}/:id`, () => HttpResponse.json(document)),
      http.put(`${BASE}/admin/config/${kind}/:id`, async ({ request }) => {
        sent.push(await request.json())
        return HttpResponse.json({ ...document, updated_at: '2026-11-26T15:00:00Z', version: 3 })
      })
    )

    const response = await put[kind](
      new NextRequest(`http://playground.test/api/${kind}/${document.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'If-Match': '"2"' },
        body: JSON.stringify({ ...bodies[kind], id: document.id })
      }),
      params(document.id)
    )

    expect(response.status).toBe(200)
    expect((await response.json()).data.updated_at).toBe('2026-11-26T15:00:00Z')
    expect(sent).toHaveLength(1)
    expect(sent[0]).not.toHaveProperty('updated_at')
    expect(sent[0]).not.toHaveProperty('version')
  })
})

describe('POST /api/agents: a resposta traz a data do save', () => {
  it('item recém-criado', async () => {
    server.use(
      http.post(`${BASE}/admin/config/agents`, () =>
        HttpResponse.json({ ...documents.agents, version: 1, updated_at: SAVED }, { status: 201 })
      )
    )

    const response = await AGENT_POST(
      new NextRequest('http://playground.test/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...bodies.agents, id: 'a1' })
      })
    )

    expect(response.status).toBe(200)
    expect((await response.json()).data.updated_at).toBe(SAVED)
  })
})
