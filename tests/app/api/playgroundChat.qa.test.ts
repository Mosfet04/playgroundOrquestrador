// @vitest-environment node
import { http, HttpResponse } from 'msw'
import { NextRequest } from 'next/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { POST as runAgent } from '@/app/api/playground/agents/[id]/runs/route'
import { GET as listSessions } from '@/app/api/playground/sessions/route'
import {
  DELETE as deleteSession,
  GET as getSession
} from '@/app/api/playground/sessions/[id]/route'
import { POST as runTeam } from '@/app/api/playground/teams/[id]/runs/route'
import { SESSION_COOKIE, createSession } from '@/server/session'

import { TEST_ENV, TEST_USER } from '../../../e2e/test-env'
import { server } from '../../msw/server'

// QA P2-03: o que o dev não cobriu no BFF do chat. Entrada hostil do browser
// (user_id forjado, id que sai do segmento, query injetada), o que o
// orquestrador devolve a mais e o teto de 256 KB na borda. Complementa
// playgroundChat.test.ts. O middleware sobre /api/playground fica no e2e
// (chamar middleware() direto ignora o matcher).

const BASE = TEST_ENV.ORCHESTRATOR_URL
const APP = 'http://playground.test'
const LEAK = 'detalhe-interno-do-orquestrador'
const params = (id: string) => ({ params: Promise.resolve({ id }) })

async function request(
  path: string,
  init: { method?: string; body?: unknown; headers?: HeadersInit } = {}
) {
  const headers = new Headers({
    cookie: `${SESSION_COOKIE}=${await createSession(TEST_USER.username)}`,
    ...init.headers
  })
  if (init.body !== undefined) headers.set('content-type', 'application/json')
  return new NextRequest(`${APP}${path}`, {
    method: init.method ?? 'GET',
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body)
  })
}

const sse = (events: Record<string, unknown>[]) =>
  new HttpResponse(
    events
      .map((e) => `event: ${e.event}\ndata: ${JSON.stringify(e)}\n\n`)
      .join(''),
    { headers: { 'Content-Type': 'text/event-stream' } }
  )

afterEach(() => {
  vi.restoreAllMocks()
})

describe('run: o browser não escolhe o que é do servidor', () => {
  it('user_id, stream e monitor no corpo (ou na query) são ignorados; o user_id é o sub da sessão', async () => {
    const forms: FormData[] = []
    server.use(
      http.post(`${BASE}/agents/:id/runs`, async ({ request }) => {
        forms.push(await request.formData())
        return sse([{ event: 'RunCompleted', content: 'ok' }])
      })
    )

    const response = await runAgent(
      await request('/api/playground/agents/agent-1/runs?user_id=admin', {
        method: 'POST',
        body: {
          message: 'oi',
          user_id: 'admin',
          stream: 'false',
          monitor: 'true',
          agent_id: 'outro'
        }
      }),
      params('agent-1')
    )
    await response.text()

    expect(forms).toHaveLength(1)
    expect([...forms[0].keys()].sort()).toEqual([
      'message',
      'stream',
      'user_id'
    ])
    expect(forms[0].get('user_id')).toBe(TEST_USER.username)
    expect(forms[0].get('stream')).toBe('true')
  })
})

describe('run: resposta do BFF', () => {
  it('só os cabeçalhos do BFF: nada do orquestrador (cookie, host interno) atravessa', async () => {
    server.use(
      http.post(
        `${BASE}/agents/:id/runs`,
        () =>
          new HttpResponse(
            'event: RunCompleted\ndata: {"event":"RunCompleted"}\n\n',
            {
              headers: {
                'Content-Type': 'text/event-stream',
                'Set-Cookie': 'orq=segredo; Path=/',
                'X-Internal-Url': BASE,
                Server: 'uvicorn',
                'Content-Encoding': 'identity'
              }
            }
          )
      )
    )

    const response = await runAgent(
      await request('/api/playground/agents/a/runs', {
        method: 'POST',
        body: { message: 'oi' }
      }),
      params('a')
    )

    expect(response.headers.get('set-cookie')).toBeNull()
    expect(response.headers.get('x-internal-url')).toBeNull()
    expect(response.headers.get('server')).toBeNull()
    expect(response.headers.get('cache-control')).toContain('no-transform')
    expect(response.headers.get('content-type')).toBe('text/event-stream')
  })

  it.each([
    ['422', 422, 'rejected'],
    ['403', 403, 'forbidden']
  ])('team: orquestrador %s ⇒ 502 %s, sem eco', async (_, upstream, code) => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    server.use(
      http.post(`${BASE}/teams/:id/runs`, () =>
        HttpResponse.json({ detail: LEAK }, { status: upstream })
      )
    )

    const response = await runTeam(
      await request('/api/playground/teams/t/runs', {
        method: 'POST',
        body: { message: 'oi' }
      }),
      params('t')
    )
    const text = await response.text()

    // 403 do orquestrador é falha de config do BFF, não do usuário: 502
    expect(response.status).toBe(502)
    expect(JSON.parse(text)).toEqual({ success: false, error: code })
    expect(text).not.toContain(LEAK)
    expect(text).not.toContain(TEST_ENV.ORCHESTRATOR_API_KEY_RUN)
  })
})

describe('teto do corpo (256 KB)', () => {
  const post = async (contentLength: number, message = 'x') =>
    runAgent(
      new NextRequest(`${APP}/api/playground/agents/a/runs`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'content-length': String(contentLength),
          cookie: `${SESSION_COOKIE}=${await createSession(TEST_USER.username)}`
        },
        body: JSON.stringify({ message })
      }),
      params('a')
    )

  it('exatamente 256 KB passa; um byte a mais é 413', async () => {
    server.use(
      http.post(`${BASE}/agents/:id/runs`, () =>
        sse([{ event: 'RunCompleted' }])
      )
    )

    expect((await post(256 * 1024)).status).toBe(200)
    expect((await post(256 * 1024 + 1)).status).toBe(413)
  })
})

describe('ids e query hostis do browser', () => {
  // Sem encodeURIComponent, `?` e `#` cairiam na query/fragmento e `a\\b` seria
  // outro caminho: o que sai é sempre UM segmento sob /sessions/ (ou 400).
  it.each([['x?admin=1'], ['x#frag'], ['a b'], ['a&b=1']])(
    'DELETE com id %j chama exatamente DELETE /sessions/<id codificado>, uma vez',
    async (id) => {
      const seen: string[] = []
      server.use(
        http.all(`${BASE}/*`, ({ request }) => {
          const url = new URL(request.url)
          seen.push(`${request.method} ${url.pathname} ${url.search}`)
          return new HttpResponse(null, { status: 204 })
        })
      )

      const response = await deleteSession(
        await request('/api/playground/sessions/x', { method: 'DELETE' }),
        params(id)
      )

      expect(response.status).toBe(200)
      expect(seen).toEqual([`DELETE /sessions/${encodeURIComponent(id)} `])
    }
  )

  it('id com barra invertida ⇒ 400 invalid_path, sem chamar o orquestrador', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    let called = false
    server.use(
      http.all(`${BASE}/*`, () => ((called = true), HttpResponse.json({})))
    )

    const response = await deleteSession(
      await request('/api/playground/sessions/x', { method: 'DELETE' }),
      params('a\\b')
    )

    expect(response.status).toBe(400)
    expect(called).toBe(false)
  })

  it('component_id com & e = chega como UM valor; user_id, limit e page do browser não passam', async () => {
    let seen: URL | null = null
    server.use(
      http.get(`${BASE}/sessions`, ({ request }) => {
        seen = new URL(request.url)
        return HttpResponse.json({ data: [] })
      })
    )

    const response = await listSessions(
      await request(
        `/api/playground/sessions?type=agent&component_id=${encodeURIComponent('x&type=team&limit=9999')}&limit=9999&page=7&user_id=admin`
      )
    )

    expect(response.status).toBe(200)
    expect(seen!.searchParams.getAll('type')).toEqual(['agent'])
    expect(seen!.searchParams.get('component_id')).toBe(
      'x&type=team&limit=9999'
    )
    expect(seen!.searchParams.getAll('limit')).toEqual(['20'])
    expect(seen!.searchParams.getAll('page')).toEqual(['1'])
    expect(seen!.searchParams.has('user_id')).toBe(false)
  })

  it('GET /sessions/[id]: type fora do enum ⇒ 400', async () => {
    for (const type of ['', 'workflow', 'agent,team', 'AGENT']) {
      const response = await getSession(
        await request(
          `/api/playground/sessions/s?type=${encodeURIComponent(type)}`
        ),
        params('s')
      )
      expect(response.status).toBe(400)
    }
  })
})

describe('o que o orquestrador devolve a mais não vai ao browser', () => {
  it('histórico sem chat_history ⇒ lista vazia; chat_history que não é lista ⇒ invalid_response', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    server.use(http.get(`${BASE}/sessions/:id`, () => HttpResponse.json({})))
    const empty = await getSession(
      await request('/api/playground/sessions/s?type=agent'),
      params('s')
    )
    expect(await empty.json()).toEqual({
      success: true,
      data: { chat_history: [] }
    })

    server.use(
      http.get(`${BASE}/sessions/:id`, () =>
        HttpResponse.json({ chat_history: LEAK })
      )
    )
    const bad = await getSession(
      await request('/api/playground/sessions/s?type=agent'),
      params('s')
    )
    const text = await bad.text()
    expect(bad.status).toBe(502)
    expect(JSON.parse(text).error).toBe('invalid_response')
    expect(text).not.toContain(LEAK)
  })
})
