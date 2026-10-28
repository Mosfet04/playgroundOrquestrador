// @vitest-environment node
import { http, HttpResponse } from 'msw'
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { DELETE, GET as GET_BY_ID, PUT } from '@/app/api/teams/[id]/route'
import { POST } from '@/app/api/teams/route'

import { TEST_ENV } from '../../../e2e/test-env'
import { server } from '../../msw/server'

// QA P3-04: o que tests/app/api/teams.test.ts não alcança. Entrada hostil no
// corpo e no id, 409 `used_by` com payload hostil e o log do BFF.

const BASE = TEST_ENV.ORCHESTRATOR_URL
const KEY = TEST_ENV.ORCHESTRATOR_API_KEY_ADMIN
const API = 'http://playground.test/api/teams'
const LEAK = 'detalhe-interno-do-orquestrador'

const stored = {
  id: 'suporte',
  nome: 'Suporte',
  descricao: '',
  prompt: 'p',
  factory_ia_model: 'openai',
  model: 'gpt-4o',
  member_ids: ['a'],
  mode: 'route',
  active: true,
  version: 3
}
const body = {
  nome: 'Suporte',
  factoryIaModel: 'openai',
  model: 'gpt-4o',
  member_ids: ['a'],
  mode: 'route'
}

const request = (url: string, method: string, payload: unknown, headers: Record<string, string> = {}) =>
  new NextRequest(url, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: typeof payload === 'string' ? payload : JSON.stringify(payload)
  })
const params = (id: string) => ({ params: Promise.resolve({ id }) })

let sent: { method: string; path: string; body?: Record<string, unknown> }[] = []
let warn: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  sent = []
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
})

function serve(method: 'get' | 'put' | 'post' | 'delete', respond: () => Response) {
  const path = method === 'post' ? `${BASE}/admin/config/teams` : `${BASE}/admin/config/teams/:id`
  server.use(
    http[method](path, async ({ request: req }) => {
      const text = ['POST', 'PUT'].includes(req.method) ? await req.text() : ''
      sent.push({
        method: req.method,
        path: new URL(req.url).pathname,
        ...(text ? { body: JSON.parse(text) } : {})
      })
      return respond()
    })
  )
}

describe('entrada hostil', () => {
  it('model_params com chaves __proto__/$ne: tratadas como dado, sem poluir o protótipo', async () => {
    serve('post', () => HttpResponse.json({ ...stored, id: 'novo' }, { status: 201 }))

    const response = await POST(
      request(
        API,
        'POST',
        '{"id":"novo","nome":"N","factoryIaModel":"o","model":"m","member_ids":["a"],"mode":"route",' +
          '"model_params":{"__proto__":1,"$ne":"x","constructor":true}}'
      )
    )

    expect(response.status).toBe(200)
    expect(({} as Record<string, unknown>)['__proto__']).toBe(Object.prototype)
    expect(Object.prototype).not.toHaveProperty('polluted')
    expect(sent[0].body?.model_params).toEqual(expect.objectContaining({ $ne: 'x', constructor: true }))
  })

  it('model_params com __proto__ objeto não polui o protótipo (recusado ou inerte)', async () => {
    serve('post', () => HttpResponse.json({ ...stored, id: 'novo' }, { status: 201 }))

    const response = await POST(
      request(
        API,
        'POST',
        '{"id":"novo","nome":"N","factoryIaModel":"o","model":"m","member_ids":["a"],"mode":"route",' +
          '"model_params":{"__proto__":{"polluted":true}}}'
      )
    )

    expect([200, 400]).toContain(response.status)
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })

  it('PUT: o id do corpo não vence o da rota', async () => {
    serve('get', () => HttpResponse.json(stored))
    serve('put', () => HttpResponse.json({ ...stored, version: 4 }))

    await PUT(request(`${API}/suporte`, 'PUT', { ...body, id: 'outro' }, { 'If-Match': '"3"' }), params('suporte'))

    const put = sent.find((call) => call.method === 'PUT')
    expect(put?.path).toBe('/admin/config/teams/suporte')
    expect(put?.body?.id).toBe('suporte')
  })

  it.each(['a/b', 'a?x=1', 'a#b', 'a b', '%2e%2e', 'a\\b', '..'])(
    'id %j na rota: 400, ou uma chamada a um único segmento codificado',
    async (id) => {
      serve('get', () => HttpResponse.json({ ...stored, id }))

      const response = await GET_BY_ID(new NextRequest(`${API}/x`), params(id))

      if (response.status !== 400) {
        expect(sent).toHaveLength(1)
        expect(sent[0].path.split('/').filter(Boolean)).toHaveLength(4)
        expect(sent[0].path).not.toMatch(/\.\./)
      } else {
        expect(sent).toEqual([])
      }
    }
  )

  it('id enorme na rota ⇒ 400 sem chamar o orquestrador', async () => {
    serve('get', () => HttpResponse.json(stored))

    const response = await GET_BY_ID(new NextRequest(`${API}/x`), params('a'.repeat(257)))

    expect(response.status).toBe(400)
    expect(sent).toEqual([])
  })

  it('membro com operador de Mongo em texto vai como texto literal ao orquestrador', async () => {
    serve('post', () => HttpResponse.json({ ...stored, id: 'novo' }, { status: 201 }))

    await POST(request(API, 'POST', { ...body, id: 'novo', member_ids: ['{"$ne":null}'] }))

    expect(sent[0].body?.member_ids).toEqual(['{"$ne":null}'])
  })
})

describe('409 used_by com payload hostil (DELETE)', () => {
  const del = (id = 'assistente') =>
    DELETE(request(`${API}/${id}`, 'DELETE', '', { 'If-Match': '"3"' }), params(id))
  const conflict = (usedBy: unknown) => () =>
    HttpResponse.json({ detail: LEAK, used_by: usedBy }, { status: 409 })

  it.each([
    ['mais de 100 ids', { teams: Array.from({ length: 101 }, (_, i) => `t${i}`) }],
    ['id com mais de 256 caracteres', { teams: ['ok', 'x'.repeat(257)] }],
    ['id vazio', { teams: [''] }],
    ['ids que não são texto', { teams: [null, 1, ['a']] }],
    ['teams como texto', { teams: 'suporte' }],
    ['used_by como lista', ['suporte']]
  ])('%s ⇒ 409 conflict sem lista', async (_, usedBy) => {
    serve('delete', conflict(usedBy))

    const response = await del()

    expect(response.status).toBe(409)
    const text = await response.text()
    expect(JSON.parse(text)).toEqual({ success: false, error: 'conflict' })
    expect(text).not.toContain(LEAK)
  })

  it('100 ids exatos passam; HTML e caminho no id seguem como texto (a UI os codifica)', async () => {
    const hostile = ['<img src=x onerror=alert(1)>', 'javascript:alert(1)', '../admin']
    const ids = [...hostile, ...Array.from({ length: 97 }, (_, i) => `t${i}`)]
    serve('delete', conflict({ teams: ids }))

    const response = await del()

    expect(response.status).toBe(409)
    expect((await response.json()).used_by.teams).toEqual(ids)
  })

  it('corpo do 409 que não é JSON ⇒ 409 conflict sem lista, sem eco', async () => {
    serve('delete', () => new HttpResponse(`<html>${LEAK}</html>`, { status: 409 }))

    const response = await del()

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ success: false, error: 'conflict' })
  })
})

describe('log do BFF', () => {
  it('falha do orquestrador loga método, caminho e código, sem chave, URL interna nem corpo de erro', async () => {
    serve('get', () => HttpResponse.json({ detail: LEAK, key: KEY }, { status: 500 }))
    serve('post', () => HttpResponse.json({ detail: LEAK, used_by: { teams: ['x'] } }, { status: 422 }))
    server.use(http.put(`${BASE}/admin/config/teams/:id`, () => HttpResponse.error()))

    await GET_BY_ID(new NextRequest(`${API}/x`), params('suporte'))
    await POST(request(API, 'POST', { ...body, id: 'novo' }))
    await PUT(request(`${API}/suporte`, 'PUT', body, { 'If-Match': '"3"' }), params('suporte'))

    expect(warn).toHaveBeenCalled()
    const logged = JSON.stringify(warn.mock.calls)
    expect(logged).not.toContain(KEY)
    expect(logged).not.toContain(BASE)
    expect(logged).not.toContain(LEAK)
  })
})
