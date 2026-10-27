import { http, HttpResponse } from 'msw'

// BFF do chat (P2-03, src/app/api/playground): o que o browser vê. Os route
// handlers e o mapeamento do AgentOS têm testes próprios
// (tests/app/api/playgroundChat.test.ts), contra o orquestrador no MSW.
export const BFF = '/api/playground'

export const agentsFixture = [
  {
    value: 'agent-1',
    label: 'Assistente',
    model: { provider: 'OpenAI', model: 'gpt-4o' },
    storage: true
  },
  {
    value: 'agent-2',
    label: 'Pesquisador',
    model: { provider: 'Ollama', model: 'llama3.2' },
    storage: false
  }
]

export const teamsFixture = [
  {
    value: 'team-1',
    label: 'Time de suporte',
    model: { provider: 'OpenAI', model: 'gpt-4o' },
    storage: true
  }
]

const sessionsFixture = {
  agent: [
    {
      session_id: 'session-a1',
      title: 'Primeira conversa',
      created_at: Date.UTC(2026, 0, 2, 3, 4, 5) / 1000
    }
  ],
  team: [
    {
      session_id: 'session-t1',
      title: 'Conversa do time',
      created_at: Date.UTC(2026, 1, 3, 4, 5, 6) / 1000
    }
  ]
}

const sessionOwners: Record<string, keyof typeof sessionsFixture> = {
  'agent-1': 'agent',
  'team-1': 'team'
}

// BFF das opções dos formulários (P3-01, src/app/api/config/schema): o padrão
// dos testes de AgentForm e ToolForm; cada teste troca por `server.use`.
export const SCHEMA_URL = '*/api/config/schema'
export const schemaFixture = {
  chatProviders: [
    { name: 'ollama', modelParams: ['temperature', 'top_p', 'stop'], requiresBaseUrl: false },
    { name: 'openai', modelParams: ['temperature', 'max_tokens'], requiresBaseUrl: false },
    { name: 'anthropic', modelParams: ['temperature'], requiresBaseUrl: false },
    { name: 'fake-llm', modelParams: [], requiresBaseUrl: true }
  ],
  embedderProviders: [
    { name: 'openai', modelParams: ['dimensions'], requiresBaseUrl: false },
    { name: 'ollama', modelParams: [], requiresBaseUrl: false },
    { name: 'fake-embed', modelParams: ['dimensions', 'truncate'], requiresBaseUrl: true }
  ],
  ragSearchStrategies: ['semantic', 'hierarchical'],
  httpMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  parameterTypes: ['string', 'integer', 'float', 'boolean', 'object', 'array'],
  agent: {
    markdown: true,
    addHistoryToContext: true,
    addDatetimeToContext: true,
    reasoning: false,
    numHistoryRuns: { default: 5, minimum: 1, maximum: 50 }
  },
  team: {
    modes: ['route', 'coordinate', 'broadcast', 'tasks'],
    markdown: true,
    addHistoryToContext: true
  },
  apiKeyRefFormats: ['env:<PROVEDOR>_API_KEY', 'file:<caminho em SECRETS_DIR>'],
  writable: true
}

export const handlers = [
  http.get(SCHEMA_URL, () =>
    HttpResponse.json({ success: true, data: schemaFixture })
  ),
  http.get(`${BFF}/agents`, () =>
    HttpResponse.json({ success: true, data: agentsFixture })
  ),
  http.get(`${BFF}/teams`, () =>
    HttpResponse.json({ success: true, data: teamsFixture })
  ),
  http.get(`${BFF}/sessions`, ({ request }) => {
    const params = new URL(request.url).searchParams
    const type = params.get('type')
    const componentId = params.get('component_id') ?? ''
    const data =
      type !== null && sessionOwners[componentId] === type
        ? sessionsFixture[type]
        : []
    return HttpResponse.json({ success: true, data })
  })
]
