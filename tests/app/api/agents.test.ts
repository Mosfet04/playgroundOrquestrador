// @vitest-environment node
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { PUT } from '@/app/api/agents/[id]/route'
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

function jsonRequest(url: string, method: string, body: unknown) {
  return new NextRequest(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
}

const routeParams = (id: string) => ({ params: Promise.resolve({ id }) })

beforeEach(() => {
  agentsCollection.reset([
    { ...validAgent, descricao: '', prompt: '', active: true, tools_ids: [] }
  ])
})

describe('POST /api/agents', () => {
  it.each([
    ['o corpo só com operador', { id: { $ne: null } }],
    ['operador no id', { ...validAgent, id: { $ne: null } }],
    ['operador no nome', { ...validAgent, id: 'novo', nome: { $gt: '' } }]
  ])('recusa %s com 400 sem tocar o banco', async (_, body) => {
    const response = await POST(jsonRequest(BASE_URL, 'POST', body))

    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ success: false })
    expect(agentsCollection.calls).toEqual([])
  })

  it('recusa JSON malformado com 400', async () => {
    const request = new NextRequest(BASE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"id":'
    })

    const response = await POST(request)

    expect(response.status).toBe(400)
    expect(agentsCollection.calls).toEqual([])
  })

  it('não ecoa o valor recebido na mensagem de erro', async () => {
    const response = await POST(
      jsonRequest(BASE_URL, 'POST', {
        ...validAgent,
        nome: { $where: 'segredo' }
      })
    )

    const text = await response.text()
    expect(response.status).toBe(400)
    expect(text).not.toContain('segredo')
    expect(text).not.toContain('$where')
  })

  // Decisão 0006: o BFF valida o tipo; os valores aceitos são os do orquestrador.
  it('grava factoryIaModel fora da lista do form (openai_compatible)', async () => {
    const response = await POST(
      jsonRequest(BASE_URL, 'POST', {
        ...validAgent,
        id: 'compativel',
        factoryIaModel: 'openai_compatible'
      })
    )

    expect(response.status).toBe(200)
    expect((await response.json()).data.factoryIaModel).toBe(
      'openai_compatible'
    )
  })
})

describe('PUT /api/agents/[id]', () => {
  it('recusa operador no corpo com 400 sem tocar o banco', async () => {
    const response = await PUT(
      jsonRequest(`${BASE_URL}/assistente`, 'PUT', {
        ...validAgent,
        tools_ids: { $ne: null }
      }),
      routeParams('assistente')
    )

    expect(response.status).toBe(400)
    expect(agentsCollection.calls).toEqual([])
  })
})

describe('GET /api/agents?search=', () => {
  it('trata o texto de busca como literal, não como regex', async () => {
    agentsCollection.reset([
      { id: 'repetido', nome: 'aaaa', descricao: '' },
      { id: 'literal', nome: 'busca .*(a+)+$ literal', descricao: '' }
    ])
    const search = encodeURIComponent('.*(a+)+$')

    const response = await GET(new NextRequest(`${BASE_URL}?search=${search}`))

    expect(response.status).toBe(200)
    const { data } = await response.json()
    expect(data.data.map((agent: { id: string }) => agent.id)).toEqual([
      'literal'
    ])
    expect(data.total).toBe(1)
  })
})
