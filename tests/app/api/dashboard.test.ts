// @vitest-environment node
import { delay, http, HttpResponse } from 'msw'
import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { TEST_ENV } from '../../../e2e/test-env'
import { server } from '../../msw/server'

// P2-05 (decisão 0023): o dashboard lê o /metrics do AgentOS e a config dos
// agents (chave admin), sem Mongo. Dias do período somam, usuários é o pico;
// falha do orquestrador vira código próprio, sem eco. Antes de ler, o BFF pede
// o recálculo (POST /metrics/refresh, no máximo 1 por minuto: D-P2-05-5). A
// sessão é exigida pelo middleware (tests/middleware.test.ts).

const BASE = TEST_ENV.ORCHESTRATOR_URL
const LEAK = 'detalhe-interno-do-orquestrador'
const ADMIN = `Bearer ${TEST_ENV.ORCHESTRATOR_API_KEY_ADMIN}`

const day = (date: string, extra: Record<string, unknown> = {}) => ({
  id: date,
  agent_runs_count: 0,
  agent_sessions_count: 0,
  team_runs_count: 0,
  team_sessions_count: 0,
  workflow_runs_count: 0,
  workflow_sessions_count: 5,
  users_count: 0,
  token_metrics: {},
  model_metrics: [],
  date: `${date}T00:00:00Z`,
  created_at: `${date}T12:00:00Z`,
  updated_at: `${date}T12:00:00Z`,
  ...extra
})

const metrics = [
  // fora de ordem: a atividade sai ordenada por dia
  day('2026-10-24', {
    agent_sessions_count: 3,
    team_sessions_count: 1,
    users_count: 2,
    token_metrics: { input_tokens: 70, output_tokens: 30, total_tokens: 100 },
    model_metrics: [
      { model_id: 'gpt-4o', model_provider: 'OpenAI', count: 4 },
      { model_id: 'llama3', model_provider: 'Ollama', count: 1 }
    ]
  }),
  day('2026-10-23', {
    agent_sessions_count: 2,
    users_count: 5,
    token_metrics: { total_tokens: 50 },
    model_metrics: [{ model_id: 'gpt-4o', model_provider: 'OpenAI', count: 2 }]
  }),
  // dia sem total_tokens nem count: tolerado
  day('2026-10-22', {
    users_count: 1,
    model_metrics: [{ model_id: 'llama3', model_provider: 'Ollama' }]
  })
]

const agentsPage = {
  items: [
    {
      id: 'a',
      active: true,
      rag_config: { active: true, model: 'embed-1', factory_ia_model: 'Ollama' }
    },
    {
      id: 'b',
      active: true,
      rag_config: { active: true, model: 'embed-1', factory_ia_model: 'Ollama' }
    },
    {
      id: 'c',
      active: true,
      rag_config: { active: false, model: 'embed-2', factory_ia_model: 'Ollama' }
    },
    // desativado (DELETE lógico): não conta como ativo nem no RAG
    {
      id: 'd',
      active: false,
      rag_config: { active: true, model: 'embed-3', factory_ia_model: 'Ollama' }
    }
  ],
  total: 4,
  offset: 0,
  limit: 200
}

let metricsQuery: URLSearchParams | undefined
let metricsAuth: string | null = null
let agentsAuth: string | null = null
// Ordem das chamadas ao /metrics e o que o refresh recebeu.
let calls: string[] = []
let refreshAuth: string | null = null

function serve({
  days = metrics,
  agents = agentsPage
}: { days?: object[]; agents?: object } = {}) {
  server.use(
    http.get(`${BASE}/metrics`, ({ request }) => {
      calls.push('metrics')
      metricsQuery = new URL(request.url).searchParams
      metricsAuth = request.headers.get('authorization')
      return HttpResponse.json({ metrics: days, updated_at: null })
    }),
    http.get(`${BASE}/admin/config/agents`, ({ request }) => {
      agentsAuth = request.headers.get('authorization')
      return HttpResponse.json(agents)
    })
  )
}

// O módulo guarda quando houve o último refresh: cada teste começa com um novo.
let GET: typeof import('@/app/api/dashboard/stats/route').GET
const call = (query = '') =>
  GET(new NextRequest(`http://playground.test/api/dashboard/stats${query}`))

beforeEach(async () => {
  vi.resetModules()
  ;({ GET } = await import('@/app/api/dashboard/stats/route'))
  calls = []
  refreshAuth = null
  server.use(
    http.post(`${BASE}/metrics/refresh`, ({ request }) => {
      calls.push('refresh')
      refreshAuth = request.headers.get('authorization')
      return HttpResponse.json([])
    })
  )
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-24T15:30:00Z'))
  metricsQuery = undefined
  metricsAuth = agentsAuth = null
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('GET /api/dashboard/stats', () => {
  it('agrega os dias: soma sessões, tokens e modelos; usuários é o pico diário', async () => {
    serve()

    const response = await call('?period=30d')

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      success: true,
      data: {
        activeAgents: 3,
        totalAgents: 4,
        peakDailyUsers: 5,
        totalSessions: 6,
        totalAgentSessions: 5,
        totalTeamSessions: 1,
        totalTokens: 150,
        models: [
          { name: 'gpt-4o', provider: 'OpenAI', count: 6 },
          { name: 'llama3', provider: 'Ollama', count: 1 }
        ],
        embeddingModels: [{ name: 'embed-1', provider: 'Ollama', count: 2 }],
        activityOverTime: [
          { time: '2026-10-22', sessions: 0, agentSessions: 0, teamSessions: 0 },
          { time: '2026-10-23', sessions: 2, agentSessions: 2, teamSessions: 0 },
          { time: '2026-10-24', sessions: 4, agentSessions: 3, teamSessions: 1 }
        ]
      }
    })
  })

  it('usa a chave admin nas duas chamadas', async () => {
    serve()

    await call()

    expect(metricsAuth).toBe(ADMIN)
    expect(agentsAuth).toBe(ADMIN)
  })

  describe('refresh dos agregados (D-P2-05-5)', () => {
    const MINUTE = 60_000

    it('roda antes da leitura, com a chave admin', async () => {
      serve()

      await call()

      expect(calls).toEqual(['refresh', 'metrics'])
      expect(refreshAuth).toBe(ADMIN)
    })

    it('segunda chamada em menos de 1 min não refaz; passado 1 min refaz', async () => {
      serve()

      await call()
      vi.setSystemTime(Date.now() + MINUTE - 1)
      await call()
      expect(calls).toEqual(['refresh', 'metrics', 'metrics'])

      vi.setSystemTime(Date.now() + 1)
      await call()
      expect(calls).toEqual(['refresh', 'metrics', 'metrics', 'refresh', 'metrics'])
    })

    it.each([
      ['5xx', () => HttpResponse.json({ detail: LEAK }, { status: 500 })],
      ['fora do ar', () => HttpResponse.error()],
      ['resposta qualquer', () => new HttpResponse('não é JSON', { status: 200 })]
    ])('refresh com %s não bloqueia a leitura', async (_, respond) => {
      serve()
      server.use(http.post(`${BASE}/metrics/refresh`, respond))

      const response = await call()

      expect(response.status).toBe(200)
      expect((await response.json()).data.totalTokens).toBe(150)
      expect(calls).toEqual(['metrics'])
    })

    it('refresh com prazo estourado (3 s) não bloqueia a leitura', async () => {
      serve()
      server.use(http.post(`${BASE}/metrics/refresh`, () => delay('infinite')))

      const response = await call()

      expect(response.status).toBe(200)
      expect(calls).toEqual(['metrics'])
    }, 10_000)

    it('duas chamadas simultâneas: 1 refresh só e as duas leem depois dele', async () => {
      serve()
      server.use(
        http.post(`${BASE}/metrics/refresh`, async () => {
          calls.push('refresh')
          await delay(100)
          calls.push('refresh-done')
          return HttpResponse.json([])
        })
      )

      const [first, second] = await Promise.all([call(), call()])

      expect([first.status, second.status]).toEqual([200, 200])
      expect(calls).toEqual(['refresh', 'refresh-done', 'metrics', 'metrics'])
    })

    it('refresh que falha conta como tentativa: a próxima chamada, em menos de 1 min, não insiste', async () => {
      serve()
      let attempts = 0
      server.use(
        http.post(`${BASE}/metrics/refresh`, () => {
          attempts++
          return HttpResponse.json({ detail: LEAK }, { status: 500 })
        })
      )

      await call()
      await call()

      expect(attempts).toBe(1)
    })

    it('leitura inválida (400) não chama refresh nem leitura', async () => {
      serve()

      await call('?period=1h')

      expect(calls).toEqual([])
    })
  })

  it.each([
    ['today', '2026-10-24'],
    ['7d', '2026-10-18'],
    ['30d', '2026-09-25'],
    ['90d', '2026-07-27']
  ])('período %s ⇒ starting_date=%s (dia de hoje em UTC incluído)', async (period, start) => {
    serve()

    await call(`?period=${period}`)

    expect(metricsQuery?.get('starting_date')).toBe(start)
    expect(metricsQuery?.has('ending_date')).toBe(false)
  })

  it('sem period: hoje', async () => {
    serve()

    await call()

    expect(metricsQuery?.get('starting_date')).toBe('2026-10-24')
  })

  it('sem dados: zeros e listas vazias', async () => {
    serve({ days: [], agents: { items: [], total: 0, offset: 0, limit: 200 } })

    const { data } = await (await call()).json()

    expect(data).toEqual({
      activeAgents: 0,
      totalAgents: 0,
      peakDailyUsers: 0,
      totalSessions: 0,
      totalAgentSessions: 0,
      totalTeamSessions: 0,
      totalTokens: 0,
      models: [],
      embeddingModels: [],
      activityOverTime: []
    })
  })

  it('config de agents paginada: junta as páginas até o total', async () => {
    const pages: string[] = []
    server.use(
      http.get(`${BASE}/metrics`, () => HttpResponse.json({ metrics: [] })),
      http.get(`${BASE}/admin/config/agents`, ({ request }) => {
        const url = new URL(request.url)
        const offset = Number(url.searchParams.get('offset'))
        pages.push(`${offset}/${url.searchParams.get('limit')}`)
        const count = Math.min(200, 250 - offset)
        return HttpResponse.json({
          items: Array.from({ length: count }, () => ({ active: true })),
          total: 250,
          offset,
          limit: 200
        })
      })
    )

    const { data } = await (await call()).json()

    expect(pages).toEqual(['0/200', '200/200'])
    expect(data.activeAgents).toBe(250)
    expect(data.totalAgents).toBe(250)
  })

  it('lista de agents com página vazia antes do total: usa o que veio, sem laço infinito', async () => {
    let pages = 0
    server.use(
      http.get(`${BASE}/metrics`, () => HttpResponse.json({ metrics: [] })),
      http.get(`${BASE}/admin/config/agents`, ({ request }) => {
        pages++
        const offset = Number(new URL(request.url).searchParams.get('offset'))
        return HttpResponse.json({
          items: offset === 0 ? [{ active: true }, { active: false }] : [],
          total: 5,
          offset,
          limit: 200
        })
      })
    )

    const { data } = await (await call()).json()

    expect(pages).toBe(2)
    expect(data.activeAgents).toBe(1)
    expect(data.totalAgents).toBe(5)
  })

  it('total que nunca é alcançado (páginas sempre cheias): para no teto e responde invalid_response', async () => {
    let pages = 0
    server.use(
      http.get(`${BASE}/metrics`, () => HttpResponse.json({ metrics: [] })),
      http.get(`${BASE}/admin/config/agents`, () => {
        pages++
        return HttpResponse.json({
          items: Array.from({ length: 200 }, () => ({ active: true })),
          total: 10 ** 9,
          offset: 0,
          limit: 200
        })
      })
    )

    const response = await call()

    expect(pages).toBe(50)
    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({ success: false, error: 'invalid_response' })
  })

  it.each([
    ['total negativo', { items: [], total: -1 }],
    ['total fracionário', { items: [], total: 1.5 }],
    [
      'página maior que o limit',
      { items: Array.from({ length: 201 }, () => ({ active: true })), total: 201 }
    ]
  ])('lista de agents com %s ⇒ 502 invalid_response', async (_, page) => {
    serve({ agents: page })

    const response = await call()

    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({ success: false, error: 'invalid_response' })
  })

  it.each([
    ['period desconhecido', '?period=1h'],
    ['period vazio', '?period='],
    ['period em maiúsculas', '?period=7D']
  ])('%s ⇒ 400 sem chamar o orquestrador', async (_, query) => {
    let called = false
    server.use(http.all(`${BASE}/*`, () => ((called = true), HttpResponse.json({}))))

    const response = await call(query)

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ success: false, error: 'invalid_request' })
    expect(called).toBe(false)
  })

  describe('falha do orquestrador', () => {
    const failures = [
      ['5xx', () => HttpResponse.json({ detail: LEAK }, { status: 500 }), 502, 'server_error'],
      ['chave recusada', () => HttpResponse.json({ detail: LEAK }, { status: 401 }), 502, 'unauthorized'],
      ['fora do schema', () => HttpResponse.json({ detail: LEAK }), 502, 'invalid_response'],
      ['fora do ar', () => HttpResponse.error(), 503, 'unreachable']
    ] as const

    it.each(failures)('/metrics %s ⇒ %i %s, sem eco', async (_, respond, status, error) => {
      serve()
      server.use(http.get(`${BASE}/metrics`, respond))

      const response = await call()
      const text = await response.text()

      expect(response.status).toBe(status)
      expect(JSON.parse(text)).toEqual({ success: false, error })
      for (const secret of [
        TEST_ENV.ORCHESTRATOR_API_KEY_RUN,
        TEST_ENV.ORCHESTRATOR_API_KEY_ADMIN,
        BASE,
        LEAK
      ])
        expect(text).not.toContain(secret)
    })

    it.each(failures)('/admin/config/agents %s ⇒ %i %s', async (_, respond, status, error) => {
      serve()
      server.use(http.get(`${BASE}/admin/config/agents`, respond))

      const response = await call()

      expect(response.status).toBe(status)
      expect(await response.json()).toEqual({ success: false, error })
    })
  })
})
