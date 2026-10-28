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
      .map((e) => `event: ${e.event}\ndata: ${JSON.stringify(e)}\n\n`)
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
          created_at: Date.UTC(2026, 0, 2, 3, 4, 5) / 1000
        },
        { session_id: 's2', title: 'Sem data', created_at: 0 }
      ]
    })
    expect(seen!.searchParams.get('type')).toBe('team')
    expect(seen!.searchParams.get('component_id')).toBe('a b&c')
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
