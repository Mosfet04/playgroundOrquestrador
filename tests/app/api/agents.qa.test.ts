// @vitest-environment node
// QA P0-05: o que o teste do dev não cobre (tipo errado e operador em cada campo,
// corpo null, eco de valor, operador na query).
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { GET, POST } from '@/app/api/agents/route'

import { agentsCollection } from '../../helpers/fakeMongodb'

vi.mock('@/lib/mongodb', () => import('../../helpers/fakeMongodb'))

const BASE_URL = 'http://playground.test/api/agents'

const validAgent = {
  id: 'assistente',
  nome: 'Assistente',
  model: 'gpt-4o',
  factoryIaModel: 'openai'
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

beforeEach(() => {
  agentsCollection.reset([
    { ...validAgent, descricao: 'original', prompt: '', active: true, tools_ids: [] }
  ])
})

// Cada item é um campo do form com valor de tipo errado ou operador Mongo.
const hostileFields: Array<[string, Record<string, unknown>]> = [
  ['id como array', { id: ['a'] }],
  ['nome como array', { nome: ['a'] }],
  ['model como operador', { model: { $ne: '' } }],
  ['factoryIaModel como operador', { factoryIaModel: { $regex: '.*' } }],
  ['factoryIaModel como número', { factoryIaModel: 1 }],
  ['descricao como operador', { descricao: { $ne: null } }],
  ['prompt como array', { prompt: ['x'] }],
  ['active como texto', { active: 'true' }],
  ['active como operador', { active: { $ne: false } }],
  ['tools_ids como operador', { tools_ids: { $ne: null } }],
  ['tools_ids como texto', { tools_ids: 'tool-1' }],
  ['tools_ids com operador no item', { tools_ids: [{ $ne: null }] }],
  ['tools_ids com número no item', { tools_ids: [1] }],
  ['rag_active como operador', { rag_active: { $ne: false } }],
  ['rag_doc_name como operador', { rag_active: true, rag_doc_name: { $ne: '' } }],
  ['rag_model como array', { rag_active: true, rag_model: ['m'] }],
  [
    'rag_factoryIaModel como operador',
    { rag_active: true, rag_factoryIaModel: { $gt: '' } }
  ]
]

describe('POST /api/agents: corpo hostil', () => {
  it.each(hostileFields)('recusa %s com 400 sem tocar o banco', async (_, patch) => {
    const response = await POST(
      jsonRequest(BASE_URL, 'POST', { ...validAgent, id: 'novo', ...patch })
    )

    expect(response.status).toBe(400)
    expect(agentsCollection.calls).toEqual([])
  })

  it('recusa corpo null com 400 sem tocar o banco', async () => {
    const response = await POST(rawRequest(BASE_URL, 'POST', 'null'))

    expect(response.status).toBe(400)
    expect(agentsCollection.calls).toEqual([])
  })

  it.each([
    ['id só com espaços', { id: '   ' }],
    ['factoryIaModel ausente', { factoryIaModel: undefined }]
  ])('recusa %s com 400', async (_, patch) => {
    const response = await POST(
      jsonRequest(BASE_URL, 'POST', { ...validAgent, id: 'novo', ...patch })
    )

    expect(response.status).toBe(400)
    expect(agentsCollection.calls).toEqual([])
  })

  it('não ecoa o valor quando o JSON é malformado', async () => {
    const response = await POST(rawRequest(BASE_URL, 'POST', '{"nome":"SEGREDO'))

    const text = await response.text()
    expect(response.status).toBe(400)
    expect(text).not.toContain('SEGREDO')
  })
})

describe('GET /api/agents', () => {
  it('operador na query string não vira filtro', async () => {
    agentsCollection.reset([
      { id: 'a1', nome: 'A', descricao: '', factoryIaModel: 'openai', active: true },
      { id: 'a2', nome: 'B', descricao: '', factoryIaModel: 'ollama', active: false }
    ])

    const response = await GET(
      new NextRequest(
        `${BASE_URL}?factoryIaModel[$ne]=openai&search[$ne]=zzz&active[$ne]=true`
      )
    )

    expect(response.status).toBe(200)
    expect((await response.json()).data.total).toBe(2)
  })
})
