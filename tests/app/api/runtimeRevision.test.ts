// @vitest-environment node
import { http, HttpResponse } from 'msw'
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as agentItem from '@/app/api/agents/[id]/route'
import * as agentList from '@/app/api/agents/route'
import * as teamItem from '@/app/api/teams/[id]/route'
import * as teamList from '@/app/api/teams/route'
import * as toolItem from '@/app/api/tools/[id]/route'
import * as toolList from '@/app/api/tools/route'

import { TEST_ENV } from '../../../e2e/test-env'
import { server } from '../../msw/server'

// P4-01: toda escrita de agents, teams e tools devolve a revisão do runtime
// que já a serve (header `Runtime-Revision` da API Admin, FA-04) em
// `runtimeRevision`; header ausente ou inválido some, sem falhar a escrita.
// Montagem recusada (422 com `error_type`, sem `field`) ⇒ 422 `not_applied`,
// com o `errorType` só se for identificador (D-P4-01-2), nunca o `detail`;
// 5xx da escrita ⇒ 502 `not_confirmed` (pode ter gravado sem entrar no ar).

const BASE = TEST_ENV.ORCHESTRATOR_URL
const LEAK = 'detalhe-interno-do-orquestrador'

const KINDS = {
  agents: {
    list: agentList,
    item: agentItem,
    stored: {
      id: 'x',
      nome: 'X',
      model: 'gpt-4o',
      factory_ia_model: 'openai',
      prompt: 'p',
      active: true,
      version: 3
    },
    body: { id: 'x', nome: 'X', model: 'gpt-4o', factoryIaModel: 'openai' }
  },
  teams: {
    list: teamList,
    item: teamItem,
    stored: {
      id: 'x',
      nome: 'X',
      member_ids: ['a'],
      mode: 'route',
      factory_ia_model: 'openai',
      model: 'gpt-4o',
      active: true,
      version: 3
    },
    body: { id: 'x', nome: 'X', factoryIaModel: 'openai', model: 'gpt-4o', member_ids: ['a'], mode: 'route' }
  },
  tools: {
    list: toolList,
    item: toolItem,
    stored: {
      id: 'x',
      name: 'X',
      description: 'd',
      route: 'https://api.example.com/x',
      http_method: 'GET',
      parameters: [],
      active: true,
      version: 3
    },
    body: { id: 'x', name: 'X', description: 'd', route: 'https://api.example.com/x', http_method: 'GET' }
  }
} as const
type Kind = keyof typeof KINDS
type Verb = 'create' | 'replace' | 'deactivate' | 'delete'

const VERBS: Verb[] = ['create', 'replace', 'deactivate', 'delete']
const CASES = (Object.keys(KINDS) as Kind[]).flatMap((kind) => VERBS.map((verb) => [kind, verb] as const))

const params = { params: Promise.resolve({ id: 'x' }) }
const url = (kind: Kind, path = '') => `http://playground.test/api/${kind}${path}`
const json = (body: unknown, method: string, headers: Record<string, string> = {}) => ({
  method,
  headers: { 'Content-Type': 'application/json', ...headers },
  body: JSON.stringify(body)
})

// Chama o route handler do verbo no BFF.
function write(kind: Kind, verb: Verb) {
  const { list, item, body } = KINDS[kind]
  const ifMatch = { 'If-Match': '"3"' }
  if (verb === 'create') return list.POST(new NextRequest(url(kind), json(body, 'POST')))
  if (verb === 'replace') {
    const { id: _id, ...update } = body
    void _id
    return item.PUT(new NextRequest(url(kind, '/x'), json(update, 'PUT', ifMatch)), params)
  }
  const query = verb === 'deactivate' ? '?soft=true' : ''
  return item.DELETE(new NextRequest(url(kind, `/x${query}`), { method: 'DELETE', headers: ifMatch }), params)
}

// A escrita no orquestrador: POST na coleção, PUT ou DELETE no item. O PUT de
// agents e teams lê o documento atual antes (GET, sempre 200 aqui).
function serveWrite(kind: Kind, verb: Verb, respond: () => Response) {
  const collection = `${BASE}/admin/config/${kind}`
  const item = `${collection}/:id`
  server.use(
    http.get(item, () => HttpResponse.json(KINDS[kind].stored)),
    verb === 'create'
      ? http.post(collection, respond)
      : verb === 'replace'
        ? http.put(item, respond)
        : http.delete(item, respond)
  )
}

// Resposta aceita do orquestrador: o documento (204 sem corpo no hard delete)
// com o header, quando dado.
const accepted = (kind: Kind, verb: Verb, revision?: string) => () => {
  const headers: Record<string, string> = revision === undefined ? {} : { 'Runtime-Revision': revision }
  if (verb === 'delete') return new HttpResponse(null, { status: 204, headers })
  return HttpResponse.json(
    { ...KINDS[kind].stored, version: 4 },
    { status: verb === 'create' ? 201 : 200, headers }
  )
}

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

describe('Runtime-Revision nas escritas', () => {
  it.each(CASES)('%s %s: header válido ⇒ runtimeRevision no corpo de sucesso', async (kind, verb) => {
    serveWrite(kind, verb, accepted(kind, verb, '7'))

    const response = await write(kind, verb)

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toMatchObject({ success: true, runtimeRevision: 7 })
    expect('data' in body).toBe(verb !== 'delete')
  })

  it.each(CASES)('%s %s: header ausente ⇒ sucesso sem runtimeRevision', async (kind, verb) => {
    serveWrite(kind, verb, accepted(kind, verb))

    const response = await write(kind, verb)

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.success).toBe(true)
    expect(body).not.toHaveProperty('runtimeRevision')
  })

  it.each(['abc', '-1', '1.5', '1e3', ' ', '9999999999999999', '7, 8'])(
    'header inválido (%j) ⇒ sucesso sem runtimeRevision',
    async (revision) => {
      for (const [kind, verb] of CASES) {
        serveWrite(kind, verb, accepted(kind, verb, revision))

        const response = await write(kind, verb)

        expect(response.status).toBe(200)
        const body = await response.json()
        expect(body.success).toBe(true)
        expect(body).not.toHaveProperty('runtimeRevision')
      }
    }
  )

  it('revisão 0 vale (inteiro ≥ 0)', async () => {
    serveWrite('agents', 'replace', accepted('agents', 'replace', '0'))

    expect(await (await write('agents', 'replace')).json()).toMatchObject({ runtimeRevision: 0 })
  })
})

describe('422 de montagem (ConfigNotBuildable)', () => {
  const notBuildable = (errorType: unknown) => () =>
    HttpResponse.json(
      { detail: `Configuração não monta no runtime ${LEAK}`, error_type: errorType },
      { status: 422 }
    )

  it.each(CASES)('%s %s: error_type válido ⇒ 422 not_applied com o errorType', async (kind, verb) => {
    serveWrite(kind, verb, notBuildable('ValueError'))

    const response = await write(kind, verb)
    const text = await response.text()

    expect(response.status).toBe(422)
    expect(JSON.parse(text)).toEqual({ success: false, error: 'not_applied', errorType: 'ValueError' })
    expect(text).not.toMatch(/detalhe-interno|não monta/)
  })

  it.each(['pydantic_core.ValidationError', '_Private', `A${'b'.repeat(79)}`])(
    'identificador %j passa',
    async (errorType) => {
      serveWrite('teams', 'replace', notBuildable(errorType))

      expect(await (await write('teams', 'replace')).json()).toEqual({
        success: false,
        error: 'not_applied',
        errorType
      })
    }
  )

  it.each([
    ['com espaço', 'Value Error'],
    ['com HTML', '<img src=x onerror=alert(1)>'],
    ['começando com dígito', '1Error'],
    ['acima de 80 caracteres', `A${'b'.repeat(80)}`],
    ['vazio', ''],
    ['com o detail', `ValueError: ${LEAK}`],
    ['número', 42],
    ['objeto', { name: 'ValueError' }],
    ['null', null]
  ])('error_type %s ⇒ not_applied sem errorType', async (_, errorType) => {
    for (const [kind, verb] of CASES) {
      serveWrite(kind, verb, notBuildable(errorType))

      const response = await write(kind, verb)
      const text = await response.text()

      expect(response.status).toBe(422)
      expect(JSON.parse(text)).toEqual({ success: false, error: 'not_applied' })
      expect(text).not.toMatch(/detalhe-interno|onerror/)
    }
  })

  it('422 sem error_type e sem campo segue invalid_config (P2-06)', async () => {
    serveWrite('tools', 'create', () => HttpResponse.json({ detail: LEAK }, { status: 422 }))

    expect(await (await write('tools', 'create')).json()).toEqual({ success: false, error: 'invalid_config' })
  })

  it('422 com campo segue o campo do formulário, mesmo com error_type', async () => {
    serveWrite('agents', 'create', () =>
      HttpResponse.json({ detail: LEAK, field: 'nome', error_type: 'ValueError' }, { status: 422 })
    )

    expect(await (await write('agents', 'create')).json()).toEqual({
      success: false,
      error: 'invalid_config',
      field: 'nome'
    })
  })
})

describe('5xx na escrita', () => {
  it.each(CASES)('%s %s: 500 ⇒ 502 not_confirmed, sem eco', async (kind, verb) => {
    serveWrite(kind, verb, () => HttpResponse.json({ detail: LEAK }, { status: 500 }))

    const response = await write(kind, verb)
    const text = await response.text()

    expect(response.status).toBe(502)
    expect(JSON.parse(text)).toEqual({ success: false, error: 'not_confirmed' })
    expect(text).not.toContain(LEAK)
  })

  it('503 também é not_confirmed', async () => {
    serveWrite('tools', 'replace', () => HttpResponse.json({ detail: LEAK }, { status: 503 }))

    expect(await (await write('tools', 'replace')).json()).toEqual({ success: false, error: 'not_confirmed' })
  })

  // O PUT de agent e team lê o documento antes: 5xx nessa leitura não chegou a
  // escrever, então segue server_error.
  it.each(['agents', 'teams'] as const)('%s: 5xx na leitura antes do PUT ⇒ 502 server_error', async (kind) => {
    server.use(
      http.get(`${BASE}/admin/config/${kind}/:id`, () => HttpResponse.json({ detail: LEAK }, { status: 500 }))
    )

    const response = await write(kind, 'replace')

    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({ success: false, error: 'server_error' })
  })
})
