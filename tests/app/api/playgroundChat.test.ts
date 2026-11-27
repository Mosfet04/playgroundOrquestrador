// @vitest-environment node
import { http, HttpResponse } from 'msw'
import { NextRequest } from 'next/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { GET as listAgents } from '@/app/api/playground/agents/route'
import { POST as runAgent } from '@/app/api/playground/agents/[id]/runs/route'
import { GET as listSessions } from '@/app/api/playground/sessions/route'
import {
  DELETE as deleteSession,
  GET as getSession
} from '@/app/api/playground/sessions/[id]/route'
import { GET as listTeams } from '@/app/api/playground/teams/route'
import { POST as runTeam } from '@/app/api/playground/teams/[id]/runs/route'
import { SESSION_COOKIE, createSession } from '@/server/session'

import { TEST_ENV, TEST_USER } from '../../../e2e/test-env'
import { server } from '../../msw/server'

// P2-03: o chat pelo BFF. Listas, sessões (excluir com a chave admin) e o run
// em stream repassado sem buffer; ids do browser validados e codificados;
// falha do orquestrador vira código próprio, sem eco.

const BASE = TEST_ENV.ORCHESTRATOR_URL
const APP = 'http://playground.test'
const LEAK = 'detalhe-interno-do-orquestrador'
const SECRETS = [
  TEST_ENV.ORCHESTRATOR_API_KEY_RUN,
  TEST_ENV.ORCHESTRATOR_API_KEY_ADMIN,
  BASE,
  LEAK
]

const expectNoLeak = (text: string) => {
  for (const secret of SECRETS) expect(text).not.toContain(secret)
}
const params = (id: string) => ({ params: Promise.resolve({ id }) })

async function request(
  path: string,
  init: { method?: string; body?: unknown; signal?: AbortSignal } = {}
) {
  const headers = new Headers({
    cookie: `${SESSION_COOKIE}=${await createSession(TEST_USER.username)}`
  })
  if (init.body !== undefined) headers.set('content-type', 'application/json')
  return new NextRequest(`${APP}${path}`, {
    method: init.method ?? 'GET',
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: init.signal
  })
}

const sse = (events: Record<string, unknown>[]) =>
  new HttpResponse(
    events
      .map((e) => `event: ${e.event}\ndata: ${JSON.stringify({ nested_depth: 0, ...e })}\n\n`)
      .join(''),
    {
      headers: { 'Content-Type': 'text/event-stream' }
    }
  )

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('GET /api/playground/agents e /teams', () => {
  it('lista com a chave run, só os campos do cartão', async () => {
    let authorization: string | null = null
    server.use(
      http.get(`${BASE}/agents`, ({ request }) => {
        authorization = request.headers.get('authorization')
        return HttpResponse.json([
          {
            id: 'agent-1',
            name: 'Assistente',
            model: { name: 'gpt', model: 'gpt-4o', provider: 'OpenAI' },
            sessions: { session_table: 'agno_sessions' },
            system_message: { instructions: LEAK }
          },
          { id: 'agent-2', name: null, model: null },
          { id: null, name: 'Sem id' }
        ])
      })
    )

    const response = await listAgents()
    const text = await response.text()

    expect(response.status).toBe(200)
    expect(authorization).toBe(`Bearer ${TEST_ENV.ORCHESTRATOR_API_KEY_RUN}`)
    expect(JSON.parse(text)).toEqual({
      success: true,
      data: [
        {
          value: 'agent-1',
          label: 'Assistente',
          model: { provider: 'OpenAI', model: 'gpt-4o' },
          storage: true
        },
        {
          value: 'agent-2',
          label: '',
          model: { provider: '', model: '' },
          storage: false
        }
      ]
    })
    expectNoLeak(text)
  })

  it('teams pelo `id` do contrato', async () => {
    server.use(
      http.get(`${BASE}/teams`, () =>
        HttpResponse.json([
          { id: 'team-1', name: 'Suporte', mode: 'coordinate' }
        ])
      )
    )

    expect(await (await listTeams()).json()).toEqual({
      success: true,
      data: [
        {
          value: 'team-1',
          label: 'Suporte',
          model: { provider: '', model: '' },
          storage: false
        }
      ]
    })
  })

  it.each([
    ['fora do ar', () => HttpResponse.error(), 503, 'unreachable'],
    [
      '5xx',
      () => HttpResponse.json({ detail: LEAK }, { status: 500 }),
      502,
      'server_error'
    ],
    [
      'chave recusada',
      () => HttpResponse.json({ detail: LEAK }, { status: 401 }),
      502,
      'unauthorized'
    ],
    [
      'fora do schema',
      () => HttpResponse.json({ agents: LEAK }),
      502,
      'invalid_response'
    ]
  ])(
    'orquestrador %s ⇒ %i com o código, sem eco',
    async (_, respond, status, error) => {
      vi.spyOn(console, 'warn').mockImplementation(() => {})
      server.use(http.get(`${BASE}/agents`, respond))

      const response = await listAgents()
      const text = await response.text()

      expect(response.status).toBe(status)
      expect(JSON.parse(text)).toEqual({ success: false, error })
      expectNoLeak(text)
    }
  )

  it('env faltando: lança (o Next responde 500 sem corpo), sem valor no erro', async () => {
    vi.stubEnv('ORCHESTRATOR_API_KEY_RUN', '')

    const error = await listAgents().catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toContain('ORCHESTRATOR_API_KEY_RUN')
    expectNoLeak((error as Error).message)
  })
})

describe('GET /api/playground/sessions', () => {
  it('lista as sessões do componente (query codificada) com data em segundos', async () => {
    let seen: URL | null = null
    server.use(
      http.get(`${BASE}/sessions`, ({ request }) => {
        seen = new URL(request.url)
        return HttpResponse.json({
          data: [
            {
              session_id: 's1',
              session_name: 'Primeira',
              created_at: '2026-01-02T03:04:05Z'
            },
            { session_id: 's2', session_name: 'Sem data' }
          ],
          meta: { page: 1, limit: 20, total_pages: 1, total_count: 2 }
        })
      })
    )

    const response = await listSessions(
      await request('/api/playground/sessions?type=team&component_id=a%20b%26c')
    )

    expect(await response.json()).toEqual({
      success: true,
      data: [
        {
          session_id: 's1',
          title: 'Primeira',
          updated_at: Date.UTC(2026, 0, 2, 3, 4, 5) / 1000
        },
        { session_id: 's2', title: 'Sem data', updated_at: 0 }
      ]
    })
    expect(seen!.searchParams.get('type')).toBe('team')
    expect(seen!.searchParams.get('component_id')).toBe('a b&c')
  })

  // QA1-02 (#4): o horário da linha é o da última atividade (a ordem da lista
  // já é por updated_at); sem ele, o da criação.
  it('horário da sessão: o updated_at, e o created_at sem ele', async () => {
    server.use(
      http.get(`${BASE}/sessions`, () =>
        HttpResponse.json({
          data: [
            {
              session_id: 's1',
              session_name: 'Ola',
              created_at: '2026-01-02T03:04:05Z',
              updated_at: '2026-01-05T10:00:00Z'
            },
            { session_id: 's2', session_name: 'Só criada', created_at: '2026-01-02T03:04:05Z' }
          ],
          meta: { page: 1, limit: 20, total_pages: 1, total_count: 2 }
        })
      )
    )

    const response = await listSessions(
      await request('/api/playground/sessions?type=agent&component_id=a')
    )

    expect((await response.json()).data).toEqual([
      { session_id: 's1', title: 'Ola', updated_at: Date.UTC(2026, 0, 5, 10) / 1000 },
      { session_id: 's2', title: 'Só criada', updated_at: Date.UTC(2026, 0, 2, 3, 4, 5) / 1000 }
    ])
  })

  // AG3-02 (D-AG3-02-1): o 3.1.12 só deixa rodar na sessão do dono, então a
  // lista vai filtrada pelo usuário do login (cookie), nunca pelo browser.
  it('manda o user_id do login ao orquestrador', async () => {
    let seen: URL | null = null
    server.use(
      http.get(`${BASE}/sessions`, ({ request }) => {
        seen = new URL(request.url)
        return HttpResponse.json({ data: [] })
      })
    )

    await listSessions(
      await request('/api/playground/sessions?type=agent&component_id=x')
    )

    expect(seen!.searchParams.getAll('user_id')).toEqual([TEST_USER.username])
  })

  it('sem sessão válida ⇒ 401, sem chamar o orquestrador', async () => {
    let called = false
    server.use(
      http.get(`${BASE}/sessions`, () => ((called = true), HttpResponse.json({ data: [] })))
    )

    const response = await listSessions(
      new NextRequest(`${APP}/api/playground/sessions?type=agent&component_id=x`)
    )

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ success: false, error: 'unauthorized' })
    expect(called).toBe(false)
  })

  it('404 do orquestrador (sem storage): lista vazia', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    server.use(
      http.get(`${BASE}/sessions`, () => HttpResponse.json({}, { status: 404 }))
    )

    const response = await listSessions(
      await request('/api/playground/sessions?type=agent&component_id=x')
    )

    expect(await response.json()).toEqual({ success: true, data: [] })
  })

  it.each([
    ['sem type', '?component_id=x'],
    ['type inválido', '?type=workflow&component_id=x'],
    ['sem componente', '?type=agent']
  ])('%s ⇒ 400 sem chamar o orquestrador', async (_, query) => {
    const response = await listSessions(
      await request(`/api/playground/sessions${query}`)
    )

    expect(response.status).toBe(400)
  })
})

describe('/api/playground/sessions/[id]', () => {
  it('GET devolve só user/assistant do histórico (sem system), com o type', async () => {
    let type: string | null = null
    server.use(
      http.get(`${BASE}/sessions/:id`, ({ request }) => {
        type = new URL(request.url).searchParams.get('type')
        return HttpResponse.json({
          session_id: 's1',
          session_name: 'x',
          chat_history: [
            { role: 'system', content: LEAK, created_at: 1 },
            { role: 'user', content: 'oi', created_at: 2, metrics: { x: 1 } },
            { role: 'assistant', content: 'olá', created_at: 3 }
          ]
        })
      })
    )

    const response = await getSession(
      await request('/api/playground/sessions/s1?type=team'),
      params('s1')
    )
    const text = await response.text()

    expect(type).toBe('team')
    expect(JSON.parse(text)).toEqual({
      success: true,
      data: {
        chat_history: [
          { role: 'user', content: 'oi', created_at: 2 },
          { role: 'assistant', content: 'olá', created_at: 3 }
        ]
      }
    })
    expectNoLeak(text)
  })

  // QA1-03 (review R7, D-QA1-03-5): no agno 3.1.12 o run que falha depois de
  // uma tool grava o assistant com `tool_calls` e sem texto
  // (flush_in_flight_messages_on_error). Ele não é resposta: sai do histórico,
  // e a pergunta fica "sem resposta". Com mídia, ou sem nada, continua.
  it.each([
    ['content nulo', null],
    ['content vazio', ''],
    ['content lista vazia', []]
  ])('assistant sem texto (%s) que só tem tool_calls sai do histórico', async (_, content) => {
    server.use(
      http.get(`${BASE}/sessions/:id`, () =>
        HttpResponse.json({
          chat_history: [
            { role: 'user', content: 'consulte o pedido', created_at: 1 },
            {
              role: 'assistant',
              content,
              tool_calls: [{ id: 'c1', type: 'function', function: { name: 'consultar_pedido', arguments: '{}' } }],
              created_at: 2
            }
          ]
        })
      )
    )

    const response = await getSession(await request('/api/playground/sessions/s1?type=agent'), params('s1'))

    expect((await response.json()).data.chat_history).toEqual([
      { role: 'user', content: 'consulte o pedido', created_at: 1 }
    ])
  })

  it('assistant sem texto com mídia, ou sem nada, continua; o formato da resposta não muda', async () => {
    const toolCalls = [{ id: 'c1', type: 'function', function: { name: 'gerar', arguments: '{}' } }]
    server.use(
      http.get(`${BASE}/sessions/:id`, () =>
        HttpResponse.json({
          chat_history: [
            { role: 'user', content: 'gere', created_at: 1 },
            { role: 'assistant', content: null, tool_calls: toolCalls, images: [{ url: 'https://x.test/a.png' }], created_at: 2 },
            { role: 'user', content: 'e agora', created_at: 3 },
            { role: 'assistant', content: null, created_at: 4 },
            { role: 'user', content: 'ok', created_at: 5 },
            { role: 'assistant', content: 'feito', tool_calls: toolCalls, created_at: 6 }
          ]
        })
      )
    )

    const response = await getSession(await request('/api/playground/sessions/s1?type=agent'), params('s1'))

    expect((await response.json()).data.chat_history).toEqual([
      { role: 'user', content: 'gere', created_at: 1 },
      { role: 'assistant', content: null, created_at: 2 },
      { role: 'user', content: 'e agora', created_at: 3 },
      { role: 'assistant', content: null, created_at: 4 },
      { role: 'user', content: 'ok', created_at: 5 },
      { role: 'assistant', content: 'feito', created_at: 6 }
    ])
  })

  it('DELETE usa a chave admin e o id codificado', async () => {
    let authorization: string | null = null
    let path = ''
    server.use(
      http.delete(`${BASE}/sessions/:id`, ({ request }) => {
        authorization = request.headers.get('authorization')
        path = new URL(request.url).pathname
        return new HttpResponse(null, { status: 204 })
      })
    )

    const response = await deleteSession(
      await request('/api/playground/sessions/x', { method: 'DELETE' }),
      params('a b')
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ success: true })
    expect(authorization).toBe(`Bearer ${TEST_ENV.ORCHESTRATOR_API_KEY_ADMIN}`)
    expect(path).toBe('/sessions/a%20b')
  })

  it.each([['..'], ['.'], ['a/b'], ['../admin/config/agents/x']])(
    'id %s ⇒ 400 invalid_path, sem chamar o orquestrador',
    async (id) => {
      vi.spyOn(console, 'warn').mockImplementation(() => {})
      let called = false
      server.use(
        http.all(`${BASE}/*`, () => ((called = true), HttpResponse.json({})))
      )

      const response = await deleteSession(
        await request('/api/playground/sessions/x', { method: 'DELETE' }),
        params(id)
      )

      expect(response.status).toBe(400)
      expect(await response.json()).toEqual({
        success: false,
        error: 'invalid_path'
      })
      expect(called).toBe(false)
    }
  )

  it('id vazio ou longo demais ⇒ 400', async () => {
    expect(
      (
        await getSession(
          await request('/api/playground/sessions/x?type=agent'),
          params('')
        )
      ).status
    ).toBe(400)
    expect(
      (
        await getSession(
          await request('/api/playground/sessions/x?type=agent'),
          params('x'.repeat(300))
        )
      ).status
    ).toBe(400)
  })
})

describe('POST /api/playground/{agents,teams}/[id]/runs', () => {
  it('repassa o SSE e manda o user_id da sessão; team leva monitor', async () => {
    const forms: Record<string, FormDataEntryValue | null>[] = []
    const capture = async (request: Request) => {
      const form = await request.formData()
      forms.push(
        Object.fromEntries(
          ['message', 'stream', 'session_id', 'user_id', 'monitor'].map((k) => [
            k,
            form.get(k)
          ])
        )
      )
    }
    server.use(
      http.post(`${BASE}/agents/:id/runs`, async ({ request }) => {
        await capture(request)
        return sse([
          { event: 'RunStarted', session_id: 's9' },
          { event: 'RunCompleted', content: 'ok' }
        ])
      }),
      http.post(`${BASE}/teams/:id/runs`, async ({ request }) => {
        await capture(request)
        return sse([{ event: 'TeamRunCompleted', content: 'ok' }])
      })
    )

    const agent = await runAgent(
      await request('/api/playground/agents/agent-1/runs', {
        method: 'POST',
        body: { message: 'oi', session_id: 's9' }
      }),
      params('agent-1')
    )
    const team = await runTeam(
      await request('/api/playground/teams/team-1/runs', {
        method: 'POST',
        body: { message: 'oi' }
      }),
      params('team-1')
    )

    expect(agent.status).toBe(200)
    expect(agent.headers.get('content-type')).toContain('text/event-stream')
    expect(await agent.text()).toContain('event: RunCompleted')
    expect(await team.text()).toContain('TeamRunCompleted')
    expect(forms).toEqual([
      {
        message: 'oi',
        stream: 'true',
        session_id: 's9',
        user_id: TEST_USER.username,
        monitor: null
      },
      {
        message: 'oi',
        stream: 'true',
        session_id: null,
        user_id: TEST_USER.username,
        monitor: 'true'
      }
    ])
  })

  it('repassa sem buffer: o 1º evento chega antes do fim do run', async () => {
    let finish!: () => void
    server.use(
      http.post(`${BASE}/agents/:id/runs`, () => {
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(
              new TextEncoder().encode('event: RunStarted\ndata: {}\n\n')
            )
            finish = () => controller.close()
          }
        })
        return new HttpResponse(stream, {
          headers: { 'Content-Type': 'text/event-stream' }
        })
      })
    )

    const response = await runAgent(
      await request('/api/playground/agents/agent-1/runs', {
        method: 'POST',
        body: { message: 'oi' }
      }),
      params('agent-1')
    )
    const reader = response.body!.getReader()

    expect(new TextDecoder().decode((await reader.read()).value)).toContain(
      'RunStarted'
    )
    finish()
    expect((await reader.read()).done).toBe(true)
  })

  it('o abort do browser chega ao orquestrador', async () => {
    let aborted = false
    server.use(
      http.post(`${BASE}/agents/:id/runs`, ({ request }) => {
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('data: {}\n\n'))
            request.signal.addEventListener('abort', () => {
              aborted = true
              controller.error(request.signal.reason)
            })
          }
        })
        return new HttpResponse(stream, {
          headers: { 'Content-Type': 'text/event-stream' }
        })
      })
    )
    const browser = new AbortController()

    const response = await runAgent(
      await request('/api/playground/agents/agent-1/runs', {
        method: 'POST',
        body: { message: 'oi' },
        signal: browser.signal
      }),
      params('agent-1')
    )
    expect(response.status).toBe(200)
    browser.abort()

    await vi.waitFor(() => expect(aborted).toBe(true))
  })

  it.each([
    ['fora do ar', () => HttpResponse.error(), 503, 'unreachable'],
    [
      'agente inexistente',
      () => HttpResponse.json({ detail: LEAK }, { status: 404 }),
      404,
      'not_found'
    ],
    [
      '5xx',
      () => HttpResponse.json({ detail: LEAK }, { status: 500 }),
      502,
      'server_error'
    ]
  ])(
    'orquestrador %s ⇒ %i com o código, sem eco',
    async (_, respond, status, error) => {
      vi.spyOn(console, 'warn').mockImplementation(() => {})
      server.use(http.post(`${BASE}/agents/:id/runs`, respond))

      const response = await runAgent(
        await request('/api/playground/agents/agent-1/runs', {
          method: 'POST',
          body: { message: 'oi' }
        }),
        params('agent-1')
      )
      const text = await response.text()

      expect(response.status).toBe(status)
      expect(JSON.parse(text)).toEqual({ success: false, error })
      expectNoLeak(text)
    }
  )

  // AG3-02: no 3.1.12 o run numa sessão de outro dono é 404 "Session not found";
  // vira código próprio. Outro 404 (agente inexistente) segue not_found.
  it.each([
    ['agents', runAgent],
    ['teams', runTeam]
  ])('run %s em sessão de outro dono ⇒ 404 session_not_owned, sem eco', async (kind, run) => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    server.use(
      http.post(`${BASE}/${kind}/:id/runs`, () =>
        HttpResponse.json({ detail: 'Session not found' }, { status: 404 })
      )
    )

    const response = await run(
      await request(`/api/playground/${kind}/x-1/runs`, {
        method: 'POST',
        body: { message: 'oi', session_id: 's-alheia' }
      }),
      params('x-1')
    )
    const text = await response.text()

    expect(response.status).toBe(404)
    expect(JSON.parse(text)).toEqual({ success: false, error: 'session_not_owned' })
  })

  it('404 com outro detail (ou sem corpo) continua not_found', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    for (const respond of [
      () => HttpResponse.json({ detail: 'Agent not found' }, { status: 404 }),
      () => new HttpResponse('Session not found', { status: 404 }),
      () => new HttpResponse(null, { status: 404 })
    ]) {
      server.use(http.post(`${BASE}/agents/:id/runs`, respond))

      const response = await runAgent(
        await request('/api/playground/agents/agent-1/runs', {
          method: 'POST',
          body: { message: 'oi' }
        }),
        params('agent-1')
      )

      expect(response.status).toBe(404)
      expect(await response.json()).toEqual({ success: false, error: 'not_found' })
    }
  })

  it('sem sessão válida ⇒ 401, sem chamar o orquestrador', async () => {
    let called = false
    server.use(
      http.all(`${BASE}/*`, () => ((called = true), HttpResponse.json({})))
    )

    const response = await runAgent(
      new NextRequest(`${APP}/api/playground/agents/agent-1/runs`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: `${SESSION_COOKIE}=adulterado`
        },
        body: JSON.stringify({ message: 'oi' })
      }),
      params('agent-1')
    )

    expect(response.status).toBe(401)
    expect(called).toBe(false)
  })

  it.each([
    ['mensagem vazia', { message: '' }],
    ['sem mensagem', { session_id: 's1' }],
    ['session_id não texto', { message: 'oi', session_id: 1 }],
    // R5 (review P2-03): teto da mensagem (MAX_MESSAGE_LENGTH).
    ['mensagem longa demais', { message: 'x'.repeat(32_001) }]
  ])('%s ⇒ 400 invalid_request, sem chamar o orquestrador', async (_, body) => {
    let called = false
    server.use(
      http.all(`${BASE}/*`, () => ((called = true), HttpResponse.json({})))
    )

    const response = await runAgent(
      await request('/api/playground/agents/agent-1/runs', {
        method: 'POST',
        body
      }),
      params('agent-1')
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      success: false,
      error: 'invalid_request'
    })
    expect(called).toBe(false)
  })

  it('corpo que não é JSON ⇒ 400 invalid_request', async () => {
    const response = await runAgent(
      new NextRequest(`${APP}/api/playground/agents/agent-1/runs`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: `${SESSION_COOKIE}=${await createSession(TEST_USER.username)}`
        },
        body: '{quebrado'
      }),
      params('agent-1')
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      success: false,
      error: 'invalid_request'
    })
  })

  // R9 (review P2-03): o route handler não tem limite de corpo no Next 15.2;
  // corpo declarado acima do teto nem é lido.
  it('content-length acima de 256 KB ⇒ 413, sem ler o corpo nem chamar o orquestrador', async () => {
    let called = false
    server.use(
      http.all(`${BASE}/*`, () => ((called = true), HttpResponse.json({})))
    )
    const body = JSON.stringify({ message: 'x', pad: 'y'.repeat(300_000) })

    const response = await runAgent(
      new NextRequest(`${APP}/api/playground/agents/agent-1/runs`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'content-length': String(body.length),
          cookie: `${SESSION_COOKIE}=${await createSession(TEST_USER.username)}`
        },
        body
      }),
      params('agent-1')
    )

    expect(response.status).toBe(413)
    expect(await response.json()).toEqual({
      success: false,
      error: 'payload_too_large'
    })
    expect(called).toBe(false)
  })

  it('mensagem no teto (32 000) passa', async () => {
    server.use(
      http.post(`${BASE}/agents/:id/runs`, () =>
        sse([{ event: 'RunCompleted' }])
      )
    )

    const response = await runAgent(
      await request('/api/playground/agents/agent-1/runs', {
        method: 'POST',
        body: { message: 'x'.repeat(32_000) }
      }),
      params('agent-1')
    )

    expect(response.status).toBe(200)
  })

  it('id .. ⇒ 400 invalid_path', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    const response = await runAgent(
      await request('/api/playground/agents/x/runs', {
        method: 'POST',
        body: { message: 'oi' }
      }),
      params('..')
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      success: false,
      error: 'invalid_path'
    })
  })
})

// QA1-03 (D-QA1-03-1): o RunError do run vira um código do playground
// (`overloaded`, `invalidParam` + parâmetro, `other`) e o texto do provedor só
// vai saneado em `error.detail`; os outros eventos passam como vieram.
describe('RunError do run classificado pelo BFF', () => {
  // Formato do agno 3.1.12 (RunErrorEvent): `content` é o str(exceção).
  const HIGH_DEMAND =
    "503 UNAVAILABLE. {'error': {'code': 503, 'message': 'This model is currently experiencing high demand. Please try again later.', 'status': 'UNAVAILABLE'}}"
  const PYDANTIC =
    "1 validation error for GenerateContentConfig\ntemperature\n  Input should be a valid number, unable to parse string as a number [type=float_parsing, input_value='0,7', input_type=str]\n    For further information visit https://errors.pydantic.dev/2.14/v/float_parsing"

  const runWith = async (
    body: string | Record<string, unknown>[],
    run: typeof runAgent = runAgent,
    kind = 'agents'
  ) => {
    server.use(
      http.post(`${BASE}/${kind}/:id/runs`, () =>
        typeof body === 'string'
          ? new HttpResponse(body, { headers: { 'Content-Type': 'text/event-stream' } })
          : sse(body)
      )
    )
    const response = await run(
      await request(`/api/playground/${kind}/x-1/runs`, {
        method: 'POST',
        body: { message: 'oi' }
      }),
      params('x-1')
    )
    return response.text()
  }
  // Os dados de cada evento SSE da resposta, na ordem.
  const events = (text: string) =>
    text
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => JSON.parse(line.slice('data:'.length)))
  const runError = (extra: Record<string, unknown>) => ({
    event: 'RunError',
    session_id: 's1',
    run_id: 'r1',
    agent_id: 'x-1',
    created_at: 2,
    error_type: 'model_provider_error',
    error_id: 'model_provider_error',
    additional_data: { raw: LEAK },
    ...extra
  })

  it.each([
    ['503 "high demand" do Gemini', HIGH_DEMAND],
    ['texto do fake', 'Fake provider: high demand'],
    ['429', 'Error code: 429 - Too Many Requests'],
    ['limite de taxa', 'Rate limit reached for gpt-4o'],
    ['cota', '429 RESOURCE_EXHAUSTED. Quota exceeded'],
    ['Anthropic sobrecarregado', "Error code: 529 - {'type': 'overloaded_error'}"]
  ])('sobrecarga ou limite (%s) ⇒ overloaded, com o texto em detail', async (_, content) => {
    const text = await runWith([runError({ content })])

    expect(events(text)).toEqual([
      { event: 'RunError', session_id: 's1', error: { kind: 'overloaded', detail: content } }
    ])
    expect(text).toContain('event: RunError\n')
    expectNoLeak(text)
  })

  it('erro pydantic de parâmetro ⇒ invalidParam com o nome; o texto só em detail', async () => {
    const [event] = events(await runWith([runError({ content: PYDANTIC, error_type: 'ValidationError' })]))

    expect(event).toEqual({
      event: 'RunError',
      session_id: 's1',
      error: { kind: 'invalidParam', param: 'temperature', detail: PYDANTIC }
    })
  })

  it.each([
    ['texto desconhecido', 'Connection reset by peer'],
    // Pydantic sem um nome de parâmetro legível não cita parâmetro.
    ['pydantic sem nome', '1 validation error for Config\n  Field required [type=missing]'],
    ['número solto não é status', 'Invalid input_value=5030 for seed']
  ])('%s ⇒ other, com o texto em detail', async (_, content) => {
    const [event] = events(await runWith([runError({ content })]))

    expect(event.error).toEqual({ kind: 'other', detail: content })
  })

  it('RunError sem content ⇒ other, sem detail', async () => {
    const [event] = events(await runWith([runError({ content: undefined })]))

    expect(event).toEqual({ event: 'RunError', session_id: 's1', error: { kind: 'other' } })
  })

  it('TeamRunError do team também é classificado', async () => {
    const [event] = events(
      await runWith(
        [{ event: 'TeamRunError', session_id: 's2', team_id: 'x-1', content: HIGH_DEMAND }],
        runTeam,
        'teams'
      )
    )

    expect(event).toEqual({
      event: 'TeamRunError',
      session_id: 's2',
      error: { kind: 'overloaded', detail: HIGH_DEMAND }
    })
  })

  it('detail saneado: sem stack, sem URL nem chave do orquestrador', async () => {
    const content = [
      'Traceback (most recent call last):',
      '  File "/app/src/agents/runner.py", line 42, in run',
      '    response = model.invoke(messages)',
      `RuntimeError: falhou ao chamar ${BASE}/agents/x-1/runs com ${TEST_ENV.ORCHESTRATOR_API_KEY_RUN}`,
      '  File "/app/src/other.py", line 7, in f',
      `host ${new URL(BASE).host} e ${TEST_ENV.ORCHESTRATOR_API_KEY_ADMIN}`
    ].join('\n')

    const text = await runWith([runError({ content })])
    const [event] = events(text)

    expect(event.error.detail).toBe(
      'RuntimeError: falhou ao chamar [orquestrador] com [redacted]\nhost [orquestrador] e [redacted]'
    )
    expect(text).not.toMatch(/Traceback|File "|line 42|\/app\/src/)
    expectNoLeak(text)
  })

  // Review R1: o saneamento não pode travar o BFF num texto longo sem espaço.
  it('content de 200k caracteres responde rápido e o detail sai truncado', async () => {
    const started = performance.now()
    const [event] = events(await runWith([runError({ content: 'x'.repeat(200_000) })]))

    // Sem o teto, o regex antigo levava ~27 s neste texto.
    expect(performance.now() - started).toBeLessThan(2_000)
    expect(event.error.kind).toBe('other')
    expect(event.error.detail).toHaveLength(8_001)
    expect(event.error.detail.endsWith('…')).toBe(true)
  })

  // Review R5: o fim de evento é procurado só no trecho novo de cada chunk.
  it('evento grande em muitos chunks pequenos passa rápido e inteiro', async () => {
    const block = `event: RunContent\ndata: ${JSON.stringify({ event: 'RunContent', content: 'y'.repeat(8_000_000) })}\n\n`
    server.use(
      http.post(`${BASE}/agents/:id/runs`, () => {
        const encoder = new TextEncoder()
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            for (let at = 0; at < block.length; at += 2_048)
              controller.enqueue(encoder.encode(block.slice(at, at + 2_048)))
            controller.close()
          }
        })
        return new HttpResponse(stream, { headers: { 'Content-Type': 'text/event-stream' } })
      })
    )
    const started = performance.now()

    const response = await runAgent(
      await request('/api/playground/agents/x-1/runs', { method: 'POST', body: { message: 'oi' } }),
      params('x-1')
    )

    expect(await response.text()).toBe(block)
    // Juntando o buffer a cada chunk, isto passava de 5 s.
    expect(performance.now() - started).toBeLessThan(3_000)
  })

  // Review R2: segredos e endereços internos que não são as chaves do env.
  it.each([
    ['host do orquestrador sem a porta', `falhou em http://${new URL(BASE).hostname}/agents`, 'falhou em [orquestrador]'],
    ['usuário e senha na URL', 'mongodb://admin:s3cret@mongo:27017/db caiu', 'mongodb://[redacted]@mongo:27017/db caiu'],
    ['chave na query', 'GET https://generativelanguage.googleapis.com/v1/models?alt=sse&key=AIzaSyA1b2C3d4E5f6 403', 'GET https://generativelanguage.googleapis.com/v1/models?alt=sse&key=[redacted] 403'],
    ['token na query', 'https://api.test/x?access_token=abc123&x=1', 'https://api.test/x?access_token=[redacted]&x=1'],
    ['Bearer', 'Authorization: Bearer abc.def-ghi_123 recusado', 'Authorization: Bearer [redacted] recusado'],
    ['chave sk-', 'Incorrect API key provided: sk-proj-AbCdEf123456. See docs', 'Incorrect API key provided: [redacted]. See docs'],
    // QA1-03-B2: a frase "Basic authentication" não é credencial.
    ['credencial Basic, sem a frase', 'Basic authentication failed: Basic dXNlcjpwYXNzd29yZA==', 'Basic authentication failed: Basic [redacted]'],
    [
      'Traceback no meio da linha',
      'Erro: Traceback (most recent call last):\n  File "/app/x.py", line 1, in f\n    f()\nValueError: ruim',
      'Erro:\nValueError: ruim'
    ]
  ])('detail sem %s', async (_, content, detail) => {
    const [event] = events(await runWith([runError({ content })]))

    expect(event.error.detail).toBe(detail)
  })

  // Review D1: o segredo que cruza o corte dos 8k sai inteiro (o saneamento
  // roda no texto todo, antes do corte).
  it.each([
    // O corte cai no meio da senha / logo depois do `sk-proj-a`.
    ['usuário e senha na URL', 7_979, 'mongodb://admin:Sup3rSecreta@mongo:27017/db', /admin|Sup3r/],
    ['chave sk-', 7_990, 'sk-proj-abcdefghijklmnop', /sk-proj/]
  ])('%s cruzando o corte dos 8k não vaza o começo', async (_, at, secret, leak) => {
    const content = `${'a'.repeat(at - 1)} ${secret} fim`

    const [event] = events(await runWith([runError({ content })]))

    expect(event.error.detail.endsWith('…')).toBe(true)
    expect(event.error.detail).not.toMatch(leak)
  })

  // Review D5: com hostname curto, só a palavra que cita o host sai.
  it('hostname curto: só o endereço do orquestrador sai, não as palavras que o contêm', async () => {
    vi.stubEnv('ORCHESTRATOR_URL', 'http://orq:7777')
    server.use(
      http.post('http://orq:7777/agents/:id/runs', () =>
        sse([runError({ content: 'falhou http://orq:7777/x e orq:7777; a orquestra e o sorq seguem' })])
      )
    )

    const response = await runAgent(
      await request('/api/playground/agents/x-1/runs', { method: 'POST', body: { message: 'oi' } }),
      params('x-1')
    )
    const [event] = events(await response.text())

    expect(event.error.detail).toBe('falhou [orquestrador] e [orquestrador] a orquestra e o sorq seguem')
  })

  // Review R3: textos que não são sobrecarga nem parâmetro do modelo.
  it.each([
    ['nome de tool com "unavailable"', 'Tool search_unavailable_items failed'],
    ['modelo indisponível na versão da API', 'models/gemini-x is unavailable for this API version'],
    [
      'cota esgotada (cobrança)',
      "Error code: 429 - {'error': {'message': 'You exceeded your current quota', 'type': 'insufficient_quota'}}"
    ],
    ['pydantic de outro model', '1 validation error for WeatherOutput\ncity\n  Field required [type=missing]']
  ])('%s ⇒ other', async (_, content) => {
    const [event] = events(await runWith([runError({ content })]))

    expect(event.error.kind).toBe('other')
  })

  // Review R6: na falha de serialização o agno manda `event: message`; o
  // RunError do `data` também é reescrito.
  it.each(['RunError', 'TeamRunError'])('fallback `event: message` com %s no data é classificado', async (name) => {
    const text = await runWith(
      `event: message\ndata: ${JSON.stringify({ event: name, session_id: 's1', content: HIGH_DEMAND, additional_data: { raw: LEAK } })}\n\n`
    )

    expect(events(text)).toEqual([
      { event: name, session_id: 's1', error: { kind: 'overloaded', detail: HIGH_DEMAND } }
    ])
    expectNoLeak(text)
  })

  it('RunError que não é JSON válido ⇒ other, sem o texto cru', async () => {
    const text = await runWith(
      `event: RunError\ndata: {"event":"RunError","content":"${LEAK}","metrics":NaN}\n\n`
    )

    expect(events(text)).toEqual([{ event: 'RunError', error: { kind: 'other' } }])
    expectNoLeak(text)
  })

  it('RunError cortado no fim do stream ⇒ other, sem o texto cru', async () => {
    const text = await runWith(`event: RunError\ndata: {"event":"RunError","content":"${LEAK}`)

    expect(events(text)).toEqual([{ event: 'RunError', error: { kind: 'other' } }])
    expectNoLeak(text)
  })

  // Review D2: `event: message` com JSON ilegível e o tipo RunError no texto.
  it.each(['RunError', 'TeamRunError'])('fallback `event: message` ilegível com %s ⇒ other, sem o texto cru', async (name) => {
    const text = await runWith(
      `event: message\ndata: {"event": "${name}","content":"${LEAK}","metrics":NaN}\n\n`
    )

    expect(events(text)).toEqual([{ event: name, error: { kind: 'other' } }])
    expectNoLeak(text)
  })

  it('outros eventos passam byte a byte, mesmo citando RunError no texto', async () => {
    const body = [
      'event: RunStarted\ndata: {"event":"RunStarted","session_id":"s1"}\n\n',
      `event: RunContent\ndata: {"event":"RunContent","content":"RunError: ${LEAK}"}\n\n`,
      'event: RunCompleted\ndata: {"event":"RunCompleted","content":"ok"}\n\n'
    ].join('')

    expect(await runWith(body)).toBe(body)
  })

  it('RunError partido entre dois chunks é classificado inteiro', async () => {
    const block = `event: RunError\ndata: ${JSON.stringify(runError({ content: HIGH_DEMAND }))}\n\n`
    server.use(
      http.post(`${BASE}/agents/:id/runs`, () => {
        const encoder = new TextEncoder()
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(encoder.encode(block.slice(0, 40)))
            controller.enqueue(encoder.encode(block.slice(40)))
            controller.close()
          }
        })
        return new HttpResponse(stream, { headers: { 'Content-Type': 'text/event-stream' } })
      })
    )

    const response = await runAgent(
      await request('/api/playground/agents/x-1/runs', { method: 'POST', body: { message: 'oi' } }),
      params('x-1')
    )

    expect(events(await response.text())).toEqual([
      { event: 'RunError', session_id: 's1', error: { kind: 'overloaded', detail: HIGH_DEMAND } }
    ])
  })
})
