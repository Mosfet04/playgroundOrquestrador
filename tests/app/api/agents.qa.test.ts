// @vitest-environment node
// QA P0-05: o que o teste do dev não cobre (tipo errado e operador em cada campo,
// corpo null, eco de valor). Desde a P2-06 o BFF fala com a API Admin do
// orquestrador: corpo recusado aqui nem chega a ela.
import { http, HttpResponse } from 'msw'
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it } from 'vitest'

import { POST } from '@/app/api/agents/route'

import { TEST_ENV } from '../../../e2e/test-env'
import { server } from '../../msw/server'

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

// Chamadas que chegaram ao orquestrador.
let calls: string[] = []

beforeEach(() => {
  calls = []
  server.use(
    http.all(`${TEST_ENV.ORCHESTRATOR_URL}/*`, ({ request }) => {
      calls.push(`${request.method} ${new URL(request.url).pathname}`)
      return HttpResponse.json({ detail: 'não devia chegar' }, { status: 500 })
    })
  )
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
  ],
  // P3-02: campos novos do modelo e da execução (um caso por classe)
  ['base_url como operador', { base_url: { $ne: '' } }],
  ['model_params como lista', { model_params: [['temperature', 1]] }],
  ['model_params com nome vazio', { model_params: { '': 1 } }],
  ['model_params com operador no valor', { model_params: { temperature: { $gt: 0 } } }],
  ['user_memory_active como operador', { user_memory_active: { $ne: false } }],
  ['num_history_runs como texto', { num_history_runs: '5' }]
]

describe('POST /api/agents: corpo hostil', () => {
  it.each(hostileFields)('recusa %s com 400 sem chamar o orquestrador', async (_, patch) => {
    const response = await POST(
      jsonRequest(BASE_URL, 'POST', { ...validAgent, id: 'novo', ...patch })
    )

    expect(response.status).toBe(400)
    expect(calls).toEqual([])
  })

  it('recusa corpo null com 400 sem chamar o orquestrador', async () => {
    const response = await POST(rawRequest(BASE_URL, 'POST', 'null'))

    expect(response.status).toBe(400)
    expect(calls).toEqual([])
  })

  it.each([
    ['id só com espaços', { id: '   ' }],
    ['factoryIaModel ausente', { factoryIaModel: undefined }]
  ])('recusa %s com 400', async (_, patch) => {
    const response = await POST(
      jsonRequest(BASE_URL, 'POST', { ...validAgent, id: 'novo', ...patch })
    )

    expect(response.status).toBe(400)
    expect(calls).toEqual([])
  })

  it('model_params com nome __proto__: não polui Object.prototype e a chave não chega ao orquestrador', async () => {
    let forwarded = ''
    server.use(
      http.post(`${TEST_ENV.ORCHESTRATOR_URL}/admin/config/agents`, async ({ request }) => {
        forwarded = await request.text()
        return HttpResponse.json({ detail: 'x' }, { status: 500 })
      })
    )
    const body = JSON.stringify({ ...validAgent, id: 'novo' }).replace(
      /}$/,
      ',"model_params":{"__proto__":1}}'
    )

    const response = await POST(rawRequest(BASE_URL, 'POST', body))

    expect(Object.keys(Object.prototype)).toEqual([])
    // a chave é descartada (zod): o orquestrador não recebe model_params
    expect(response.status).not.toBe(400)
    expect(JSON.parse(forwarded)).not.toHaveProperty('model_params')
  })

  it('não ecoa o valor quando o JSON é malformado', async () => {
    const response = await POST(rawRequest(BASE_URL, 'POST', '{"nome":"SEGREDO'))

    const text = await response.text()
    expect(response.status).toBe(400)
    expect(text).not.toContain('SEGREDO')
  })
})
