// @vitest-environment node
import { http, HttpResponse } from 'msw'
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { GET as GET_BY_ID, PUT } from '@/app/api/agents/[id]/route'
import { POST } from '@/app/api/agents/route'

import { TEST_ENV } from '../../../e2e/test-env'
import { server } from '../../msw/server'

// QA P3-05: o que agents.test.ts e agents.qa.test.ts não alcançam no RAG
// completo. Entrada hostil nas chaves de `rag_model_params`, GET/PUT sem perda
// do que o formulário não mostra, e o log do BFF sem a referência da chave, a
// URL base nem o documento do RAG. Sessão e Origin: tests/middleware.test.ts.

const BASE = TEST_ENV.ORCHESTRATOR_URL
const KEY = TEST_ENV.ORCHESTRATOR_API_KEY_ADMIN
const API = 'http://playground.test/api/agents'
const LEAK = 'detalhe-interno-do-orquestrador'

const ragStored = {
  active: false,
  doc_name: 'manual',
  model: 'bge-small',
  factory_ia_model: 'fake-embed',
  search_strategy: 'hierarchical',
  model_params: { dimensions: 384 },
  base_url: 'http://embed.interno:8080/v1',
  api_key_ref: 'env:EMBED_API_KEY',
  // O formulário não mostra estes: precisam sobreviver ao PUT.
  top_k: 5,
  chunk: { size: 800, overlap: 80 }
}
const stored = {
  id: 'assistente',
  nome: 'Assistente',
  factory_ia_model: 'openai',
  model: 'gpt-4o',
  descricao: '',
  prompt: 'p',
  tools_ids: [],
  rag_config: ragStored,
  active: true,
  version: 3
}
const formBody = {
  nome: 'Assistente',
  model: 'gpt-4o',
  factoryIaModel: 'openai',
  descricao: '',
  prompt: 'p',
  active: true,
  tools_ids: []
}

const request = (url: string, method: string, payload: unknown, headers: Record<string, string> = {}) =>
  new NextRequest(url, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: typeof payload === 'string' ? payload : JSON.stringify(payload)
  })
const params = (id: string) => ({ params: Promise.resolve({ id }) })

let sent: { method: string; body?: { rag_config?: Record<string, unknown> } }[] = []
let warn: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  sent = []
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
})

function serve(method: 'get' | 'put' | 'post', respond: () => Response) {
  const path = method === 'post' ? `${BASE}/admin/config/agents` : `${BASE}/admin/config/agents/:id`
  server.use(
    http[method](path, async ({ request: req }) => {
      const text = req.method === 'GET' ? '' : await req.text()
      sent.push({ method: req.method, ...(text ? { body: JSON.parse(text) } : {}) })
      return respond()
    })
  )
}

describe('rag_model_params hostil', () => {
  it('chaves __proto__, $ne e constructor viram dado: sem poluir o protótipo', async () => {
    serve('post', () => HttpResponse.json({ ...stored, id: 'novo' }, { status: 201 }))

    const response = await POST(
      request(
        API,
        'POST',
        '{"id":"novo","nome":"N","model":"m","factoryIaModel":"o","rag_active":true,"rag_doc_name":"d","rag_model":"m",' +
          '"rag_model_params":{"__proto__":1,"$ne":"x","constructor":true}}'
      )
    )

    expect(response.status).toBe(200)
    expect(Object.keys(Object.prototype)).toEqual([])
    expect(({} as Record<string, unknown>)['__proto__']).toBe(Object.prototype)
    expect(sent[0].body?.rag_config?.model_params).toEqual(
      expect.objectContaining({ $ne: 'x', constructor: true })
    )
  })

  it('__proto__ com objeto não polui o protótipo (recusado ou inerte)', async () => {
    serve('post', () => HttpResponse.json({ ...stored, id: 'novo' }, { status: 201 }))

    const response = await POST(
      request(
        API,
        'POST',
        '{"id":"novo","nome":"N","model":"m","factoryIaModel":"o","rag_active":true,' +
          '"rag_model_params":{"__proto__":{"polluted":true}}}'
      )
    )

    expect([200, 400]).toContain(response.status)
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
    expect(Object.prototype).not.toHaveProperty('polluted')
  })
})

describe('GET e PUT do RAG: o que o formulário não mostra não se perde nem vaza', () => {
  it('GET devolve só os campos do formulário: top_k e chunk não saem', async () => {
    serve('get', () => HttpResponse.json(stored))

    const response = await GET_BY_ID(new NextRequest(`${API}/assistente`), params('assistente'))

    const rag = (await response.json()).data.rag_config
    expect(rag).toEqual({
      active: false,
      doc_name: 'manual',
      model: 'bge-small',
      factoryIaModel: 'fake-embed',
      search_strategy: 'hierarchical',
      model_params: { dimensions: 384 },
      base_url: 'http://embed.interno:8080/v1',
      api_key_ref: 'env:EMBED_API_KEY'
    })
  })

  it('reabrir e salvar sem editar (RAG desligado com tudo) devolve o mesmo rag_config, com os extras', async () => {
    serve('get', () => HttpResponse.json(stored))
    serve('put', () => HttpResponse.json({ ...stored, version: 4 }))
    const read = await GET_BY_ID(new NextRequest(`${API}/assistente`), params('assistente'))
    const rag = (await read.json()).data.rag_config

    // O que o AgentForm monta ao salvar sem editar nada.
    const response = await PUT(
      request(
        `${API}/assistente`,
        'PUT',
        {
          ...formBody,
          rag_active: rag.active,
          rag_doc_name: rag.doc_name,
          rag_model: rag.model,
          rag_factoryIaModel: rag.factoryIaModel,
          rag_search_strategy: rag.search_strategy,
          rag_model_params: rag.model_params,
          rag_base_url: rag.base_url,
          rag_api_key_ref: rag.api_key_ref
        },
        { 'If-Match': '"3"' }
      ),
      params('assistente')
    )

    expect(response.status).toBe(200)
    const put = sent.find((call) => call.method === 'PUT')
    expect(put?.body?.rag_config).toEqual(ragStored)
  })

  it('limpar URL base, referência e parâmetros apaga do documento; os extras ficam', async () => {
    serve('get', () => HttpResponse.json(stored))
    serve('put', () => HttpResponse.json({ ...stored, version: 4 }))

    await PUT(
      request(
        `${API}/assistente`,
        'PUT',
        {
          ...formBody,
          rag_active: true,
          rag_doc_name: 'manual',
          rag_model: 'bge-small',
          rag_factoryIaModel: 'fake-embed',
          rag_search_strategy: 'hierarchical',
          rag_model_params: {},
          rag_base_url: '',
          rag_api_key_ref: ''
        },
        { 'If-Match': '"3"' }
      ),
      params('assistente')
    )

    const rag = sent.find((call) => call.method === 'PUT')?.body?.rag_config
    expect(rag).toMatchObject({ active: true, top_k: 5, chunk: { size: 800, overlap: 80 } })
    for (const key of ['model_params', 'base_url', 'api_key_ref']) expect(rag).not.toHaveProperty(key)
  })
})

describe('log do BFF com o RAG completo', () => {
  it('falha do orquestrador no POST e no PUT não loga referência, URL base, documento nem URL interna', async () => {
    serve('get', () => HttpResponse.json(stored))
    serve('post', () => HttpResponse.json({ detail: LEAK, key: KEY }, { status: 500 }))
    server.use(http.put(`${BASE}/admin/config/agents/:id`, () => HttpResponse.error()))
    const rag = {
      rag_active: true,
      rag_doc_name: 'manual-confidencial',
      rag_model: 'bge-small',
      rag_factoryIaModel: 'fake-embed',
      rag_search_strategy: 'hierarchical',
      rag_model_params: { dimensions: 384 },
      rag_base_url: 'http://embed.interno:8080/v1',
      rag_api_key_ref: 'env:EMBED_API_KEY'
    }

    await POST(request(API, 'POST', { ...formBody, id: 'novo', ...rag }))
    await PUT(request(`${API}/assistente`, 'PUT', { ...formBody, ...rag }, { 'If-Match': '"3"' }), params('assistente'))

    expect(warn).toHaveBeenCalled()
    const logged = JSON.stringify(warn.mock.calls)
    for (const secret of [KEY, BASE, LEAK, 'EMBED_API_KEY', 'embed.interno', 'manual-confidencial'])
      expect(logged).not.toContain(secret)
  })
})
