import { http, HttpResponse } from 'msw'

// Endpoints do AgentOS (agno 2.5.x) usados hoje por src/api/playground.ts.
// Formatos conferidos em agno/os/routers/{agents,teams}/schema.py e
// agno/os/schema.py (SessionSchema, PaginatedResponse).
export const AGENTOS_URL = 'http://agentos.test'

const agentsFixture = [
  {
    id: 'agent-1',
    name: 'Assistente',
    model: { name: 'gpt-4o', model: 'gpt-4o', provider: 'OpenAI' },
    sessions: { session_table: 'agno_sessions' }
  },
  {
    id: 'agent-2',
    name: 'Pesquisador',
    model: { name: 'llama3.2', model: 'llama3.2', provider: 'Ollama' }
  }
]

const teamsFixture = [
  {
    id: 'team-1',
    name: 'Time de suporte',
    mode: 'coordinate',
    model: { name: 'gpt-4o', model: 'gpt-4o', provider: 'OpenAI' },
    sessions: { session_table: 'agno_sessions' }
  }
]

const sessionsFixture = {
  agent: [
    {
      session_id: 'session-a1',
      session_name: 'Primeira conversa',
      created_at: '2026-01-02T03:04:05Z',
      updated_at: '2026-01-02T03:10:00Z'
    }
  ],
  team: [
    {
      session_id: 'session-t1',
      session_name: 'Conversa do time',
      created_at: '2026-02-03T04:05:06Z',
      updated_at: '2026-02-03T04:15:00Z'
    }
  ]
}

const sessionOwners: Record<string, keyof typeof sessionsFixture> = {
  'agent-1': 'agent',
  'team-1': 'team'
}

export const handlers = [
  http.get(`${AGENTOS_URL}/status`, () =>
    HttpResponse.json({ status: 'available' })
  ),
  http.get(`${AGENTOS_URL}/health`, () => HttpResponse.json({ status: 'ok' })),
  http.get(`${AGENTOS_URL}/agents`, () => HttpResponse.json(agentsFixture)),
  http.get(`${AGENTOS_URL}/teams`, () => HttpResponse.json(teamsFixture)),
  http.get(`${AGENTOS_URL}/sessions`, ({ request }) => {
    const params = new URL(request.url).searchParams
    const type = params.get('type')
    const componentId = params.get('component_id') ?? ''
    const data =
      type !== null && sessionOwners[componentId] === type
        ? sessionsFixture[type]
        : []
    return HttpResponse.json({
      data,
      meta: {
        page: 1,
        limit: 20,
        total_pages: 1,
        total_count: data.length,
        search_time_ms: 0
      }
    })
  })
]
