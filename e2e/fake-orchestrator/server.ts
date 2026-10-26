// Orquestrador falso para os testes E2E: imita só os endpoints do AgentOS
// (agno 2.5) e da API Admin que o BFF chama (src/server/orchestrator/). Exige
// a chave como o real (decisão 0018): Bearer run ou admin; 401 sem chave
// válida, 403 com a run em /admin*, /metrics* e DELETE /sessions*. As rotas de
// controle do teste (/hold/release, /aborts, /test/config/*) não existem no real
// e não pedem chave. Estado em memória; rota desconhecida => 404.
// Roda com `node e2e/fake-orchestrator/server.ts` (type stripping do Node 22.18+):
// use só sintaxe TypeScript apagável (sem enum, namespace ou parameter properties).
import { createServer } from 'node:http'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { randomUUID } from 'node:crypto'

type FakeAgent = { id: string; name: string }
// Item de sessão no formato do SessionSchema (agno/os/schema.py).
type FakeSession = {
  session_id: string
  session_name: string
  created_at: string
  updated_at: string
}

const PORT = Number(process.env.FAKE_ORCHESTRATOR_PORT ?? 7790)
const RUN_KEY = process.env.FAKE_API_KEY_RUN
const ADMIN_KEY = process.env.FAKE_API_KEY_ADMIN
if (!RUN_KEY || !ADMIN_KEY)
  throw new Error('FAKE_API_KEY_RUN e FAKE_API_KEY_ADMIN são obrigatórias (playwright.config.ts)')
const TEST_ROUTES = new Set(['POST /hold/release', 'GET /aborts'])
// GET /test/config/{kind}/{id}: documento gravado sem máscara, para o e2e
// conferir que salvar com o header mascarado não apagou o valor.
const TEST_CONFIG_ROUTE = /^GET \/test\/config\/(agents|tools)\/([^/]+)$/
// Runs cuja conexão fechou antes do fim (aba fechada, abort do BFF): o e2e
// confere em GET /aborts que o abort chegou ao orquestrador.
const abortedRuns: { entity: string; message: string }[] = []
const startedAt = new Date().toISOString()
const HOST = '127.0.0.1'
const CHUNK_DELAY_MS = 30
// Mensagem que segura o RunCompleted, para o e2e enxergar o texto parcial
// (BUG-P0-03-1, corrigido no P0-06).
const HOLD_COMPLETION_MESSAGE = 'segure o RunCompleted'
const HOLD_COMPLETION_MS = 3000
// Mensagem que para o stream antes do último delta até o teste chamar
// POST /hold/release: o e2e troca o idioma com o stream aberto (P1-04b). O
// prazo máximo evita stream preso se o teste cair antes de liberar.
const HOLD_UNTIL_RELEASE_MESSAGE = 'segure até liberar'
const HOLD_MAX_MS = 60_000
// POST /hold/release solta tudo; com `?agent=<id>`, só os streams desse agente
// (testes em paralelo não soltam os retidos uns dos outros).
const heldStreams = new Map<() => void, string>()
const waitForRelease = (agentId: string) =>
  new Promise<void>((resolve) => {
    const release = () => {
      clearTimeout(timer)
      heldStreams.delete(release)
      resolve()
    }
    const timer = setTimeout(release, HOLD_MAX_MS)
    heldStreams.set(release, agentId)
  })

const agents: FakeAgent[] = [
  { id: 'agente-alfa', name: 'Agente Alfa' },
  { id: 'agente-beta', name: 'Agente Beta' }
]
// Team com storage (P2-03): o e2e do chat em modo Team pelo BFF.
const teams: FakeAgent[] = [{ id: 'time-suporte', name: 'Time Suporte' }]
// Sessões por agente ou team (ids distintos entre os dois).
const sessionsByAgent = new Map<string, FakeSession[]>()
// Histórico no formato v2.5 lido por src/hooks/useSessionLoader.tsx
// (`chat_history` com role, content e created_at).
type ChatEntry = { role: 'user' | 'assistant'; content: string; created_at: number }
const historyBySession = new Map<string, ChatEntry[]>()

// Formato do AgentResponse do AgentOS (agno/os/routers/agents/schema.py).
const toAgentResponse = (agent: FakeAgent) => ({
  id: agent.id,
  name: agent.name,
  model: { name: 'fake-model', model: 'fake-model', provider: 'Fake' },
  sessions: { session_table: 'agno_sessions' }
})

// Config da API Admin (/admin/config/{agents,tools}, admin_config.py): documento
// snake_case com `version` (ETag), If-Match no PUT/DELETE (ausente 428, outra
// versão 412), 422 com `field` (e `indexes`) sem o valor, 409 para id existente
// ou entidade em uso, header de tool em texto mascarado (`***`) na leitura.
// Seed: um agent inativo, um com RAG ativo e um com `prompt` em lista (formato
// legado do seed real), para o dashboard contar ativos,
// total e embeddings (o e2e do CRUD de agents roda depois do dashboard:
// playwright.config.ts).
type ConfigKind = 'agents' | 'tools'
type ConfigDoc = Record<string, unknown> & { id: string; version: number }
type Refusal = { status: number; body: Record<string, unknown> }
type Checked<T> = { ok: true; value: T } | { ok: false; refusal: Refusal }

const agentDoc = (id: string, nome: string, extra: Record<string, unknown> = {}): ConfigDoc => ({
  id,
  nome,
  factory_ia_model: 'ollama',
  model: 'fake-model',
  descricao: '',
  prompt: '',
  tools_ids: [],
  rag_config: null,
  user_memory_active: false,
  summary_active: false,
  active: true,
  model_params: null,
  base_url: null,
  api_key_ref: null,
  markdown: true,
  add_history_to_context: true,
  num_history_runs: 5,
  add_datetime_to_context: true,
  reasoning: false,
  version: 1,
  ...extra
})

const configs: Record<ConfigKind, ConfigDoc[]> = {
  agents: [
    agentDoc('agente-alfa', 'Agente Alfa', {
      rag_config: {
        active: true,
        doc_name: null,
        model: 'fake-embed',
        factory_ia_model: 'Fake',
        search_strategy: 'semantic',
        model_params: null,
        base_url: null,
        api_key_ref: null
      }
    }),
    // `prompt` em lista, como no seed do orquestrador (mongo-init): a leitura
    // devolve assim; a escrita (POST/PUT) só aceita texto (D-P2-06-9).
    agentDoc('agente-beta', 'Agente Beta', { prompt: ['Você é o Beta.', 'Responda curto.'] }),
    agentDoc('agente-gama', 'Agente Gama', { active: false, version: 2 })
  ],
  tools: []
}

const AGENT_KEYS = Object.keys(agentDoc('', '')).filter((key) => key !== 'version')
const RAG_KEYS = ['active', 'doc_name', 'model', 'factory_ia_model', 'search_strategy', 'model_params', 'base_url', 'api_key_ref']
const TOOL_KEYS = ['id', 'name', 'description', 'route', 'http_method', 'parameters', 'instructions', 'headers', 'active']
const PARAMETER_KEYS = ['name', 'type', 'description', 'required', 'default_value']
const HTTP_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH']
const PARAMETER_TYPES = ['string', 'integer', 'float', 'boolean', 'object', 'array']
// GET /admin/schema (FA-03/FA-07, config_schema.py): só as seções que o
// playground lê (P3-01, P3-02), com providers que a lista antiga do playground
// não tinha (`fake-llm`, que exige URL base, e `fake-embed`) e parâmetros do
// modelo por provider. Agent e tool gravados com outro valor seguem válidos no
// fake (o seed usa `Fake` no RAG): o e2e confere o que o form oferece.
const NUM_HISTORY_RUNS_RANGE = { minimum: 1, maximum: 50 }
const SECRET_REF_FORMATS = ['env:<PROVEDOR>_API_KEY', 'file:<caminho em SECRETS_DIR>']
const SCHEMA_DOCUMENT = {
  providers: {
    chat: [
      { name: 'ollama', model_params: ['temperature', 'top_p', 'stop'], requires_base_url: false },
      { name: 'openai', model_params: ['temperature', 'max_tokens'], requires_base_url: false },
      { name: 'fake-llm', model_params: ['temperature'], requires_base_url: true }
    ],
    embedder: ['openai', 'ollama', 'fake-embed'].map((name) => ({
      name,
      model_params: [],
      requires_base_url: false
    }))
  },
  agent: {
    markdown: { type: 'boolean', default: true },
    add_history_to_context: { type: 'boolean', default: true },
    add_datetime_to_context: { type: 'boolean', default: true },
    num_history_runs: { type: 'integer', default: 5, ...NUM_HISTORY_RUNS_RANGE },
    reasoning: { type: 'boolean', default: false }
  },
  tool: { http_method: HTTP_METHODS, parameter_type: PARAMETER_TYPES },
  api_key_ref: { formats: SECRET_REF_FORMATS },
  config_store: { writable: true }
}
const MASK = '***'
const NAMEABLE_KEY = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/

const invalid = (field?: string, indexes?: number[]): { ok: false; refusal: Refusal } => ({
  ok: false,
  refusal: {
    status: 422,
    body: {
      detail: 'Configuração inválida',
      ...(field ? { field } : {}),
      ...(indexes ? { indexes } : {})
    }
  }
})
const accepted = <T>(value: T): Checked<T> => ({ ok: true, value })
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const isText = (value: unknown) => typeof value === 'string' && value !== ''
const isRef = (value: string) => /^(env|file):./.test(value)
const unknownKey = (body: Record<string, unknown>, known: string[], prefix = '') => {
  const key = Object.keys(body).find((name) => !known.includes(name))
  if (key === undefined) return null
  return invalid(NAMEABLE_KEY.test(key) ? `${prefix}${key}` : 'unknown_key')
}
const hasOperator = (value: unknown): boolean =>
  Array.isArray(value)
    ? value.some(hasOperator)
    : isRecord(value) && Object.entries(value).some(([key, item]) => key.startsWith('$') || hasOperator(item))
// Esquema, host e porta como escritos (o urlsplit do real): o URL do WHATWG
// apagaria a porta padrão e `https://h:443` passaria por `https://h`.
const origin = (route: string) => {
  const parts = /^([a-z][a-z0-9+.-]*):\/\/(?:[^@/?#]*@)?(\[[^\]]*\]|[^:/?#]*)(?::(\d*))?(?:[/?#]|$)/i.exec(route)
  return parts ? [parts[1].toLowerCase(), parts[2].toLowerCase(), parts[3] || ''].join('|') : null
}

const BOOLEAN_AGENT_KEYS = [
  'markdown',
  'add_history_to_context',
  'add_datetime_to_context',
  'reasoning',
  'user_memory_active',
  'summary_active'
]
const isScalar = (value: unknown) => ['string', 'number', 'boolean'].includes(typeof value)
const isBaseUrl = (value: unknown) =>
  typeof value === 'string' && /^https?:\/\/[^\s/?#@\\]+(\/[^\s?#\\]*)?$/.test(value)
const isSecretRef = (value: unknown) =>
  typeof value === 'string' && /^(env:[A-Z][A-Z0-9_]*_API_KEY|file:\/.+)$/.test(value)

// Campos novos do agent (FA-07, F2-01): o 422 nomeia o campo do documento; o
// `model_params` inteiro, como o real (sem o nome do parâmetro).
function checkAgentOptions(body: Record<string, unknown>) {
  const params = body.model_params
  if (params != null) {
    if (!isRecord(params) || Object.values(params).some((value) => !isScalar(value)))
      return invalid('model_params')
  }
  if (body.base_url != null && !isBaseUrl(body.base_url)) return invalid('base_url')
  if (body.api_key_ref != null && !isSecretRef(body.api_key_ref)) return invalid('api_key_ref')
  for (const key of BOOLEAN_AGENT_KEYS)
    if (body[key] != null && typeof body[key] !== 'boolean') return invalid(key)
  const runs = body.num_history_runs
  if (
    runs != null &&
    !(Number.isInteger(runs) && Number(runs) >= NUM_HISTORY_RUNS_RANGE.minimum && Number(runs) <= NUM_HISTORY_RUNS_RANGE.maximum)
  )
    return invalid('num_history_runs')
  return null
}

function checkAgent(body: Record<string, unknown>): Checked<ConfigDoc> {
  const unknown = unknownKey(body, AGENT_KEYS)
  if (unknown) return unknown
  for (const field of ['id', 'nome', 'model', 'factory_ia_model'])
    if (!isText(body[field])) return invalid(field)
  const option = checkAgentOptions(body)
  if (option) return option
  if (body.prompt !== undefined && typeof body.prompt !== 'string') return invalid('prompt')
  if (body.active !== undefined && typeof body.active !== 'boolean') return invalid('active')
  const toolsIds = body.tools_ids ?? []
  if (!Array.isArray(toolsIds) || toolsIds.some((id) => typeof id !== 'string')) return invalid('tools_ids')
  const missing = toolsIds.flatMap((id, position) =>
    configs.tools.some((tool) => tool.id === id) ? [] : [position]
  )
  if (missing.length) return invalid('tools_ids', missing)
  const rag = body.rag_config ?? null
  if (rag !== null) {
    if (!isRecord(rag)) return invalid('rag_config')
    const ragUnknown = unknownKey(rag, RAG_KEYS, 'rag_config.')
    if (ragUnknown) return ragUnknown
  }
  return accepted({ ...agentDoc(String(body.id), String(body.nome)), ...body, tools_ids: toolsIds, rag_config: rag })
}

function checkTool(body: Record<string, unknown>, current?: ConfigDoc): Checked<ConfigDoc> {
  const unknown = unknownKey(body, TOOL_KEYS)
  if (unknown) return unknown
  for (const field of ['id', 'name', 'description', 'route'])
    if (!isText(body[field])) return invalid(field)
  // Placeholder só no caminho e na query (tool_route_guard.py): no host ou na
  // porta o modelo escolheria o destino.
  if (/\{[^{}]+\}/.test(/^[a-z][a-z0-9+.-]*:\/\/([^/?#]*)/i.exec(String(body.route))?.[1] ?? ''))
    return invalid('route')
  const method = String(body.http_method ?? 'GET').toUpperCase()
  if (!HTTP_METHODS.includes(method)) return invalid('http_method')
  const parameters = body.parameters ?? []
  if (!Array.isArray(parameters)) return invalid('parameters')
  for (const [position, parameter] of parameters.entries()) {
    const ok =
      isRecord(parameter) &&
      Object.keys(parameter).every((key) => PARAMETER_KEYS.includes(key)) &&
      isText(parameter.name) &&
      isText(parameter.description) &&
      PARAMETER_TYPES.includes(String(parameter.type))
    if (!ok) return invalid('parameters', [position])
  }
  const headers = body.headers ?? {}
  if (!isRecord(headers) || Object.values(headers).some((value) => typeof value !== 'string'))
    return invalid('headers')
  // Nome sensível só por referência; a máscara mantém o gravado na mesma origem.
  const stored = isRecord(current?.headers) ? current.headers : {}
  const sameOrigin =
    current !== undefined &&
    origin(String(body.route)) !== null &&
    origin(String(body.route)) === origin(String(current.route))
  const kept: Record<string, string> = {}
  for (const [name, value] of Object.entries(headers as Record<string, string>)) {
    if (value === MASK) {
      if (!sameOrigin || typeof stored[name] !== 'string') return invalid('headers')
      kept[name] = stored[name]
      continue
    }
    const sensitive = /^(authorization|proxy-authorization|cookie)$|[-_](key|token)$/i.test(name)
    if (sensitive && !isRef(value)) return invalid('headers')
    kept[name] = value
  }
  return accepted({
    id: String(body.id),
    name: body.name,
    description: body.description,
    route: body.route,
    http_method: method,
    parameters,
    instructions: body.instructions ?? null,
    headers: kept,
    active: body.active ?? true,
    version: 0
  })
}

const shown = (kind: ConfigKind, doc: ConfigDoc): ConfigDoc =>
  kind === 'tools' && isRecord(doc.headers)
    ? {
        ...doc,
        headers: Object.fromEntries(
          Object.entries(doc.headers).map(([name, value]) => [name, isRef(String(value)) ? value : MASK])
        )
      }
    : doc

const usedBy = (kind: ConfigKind, id: string): Record<string, string[]> | null => {
  if (kind !== 'tools') return null
  const agentsUsing = configs.agents
    .filter((agent) => Array.isArray(agent.tools_ids) && agent.tools_ids.includes(id))
    .map((agent) => agent.id)
  return agentsUsing.length ? { agents: agentsUsing } : null
}

const readJson = async (req: IncomingMessage): Promise<unknown> => {
  const chunks: Uint8Array[] = []
  for await (const chunk of req) chunks.push(chunk as Uint8Array)
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    return undefined
  }
}

const sendConfig = (res: ServerResponse, status: number, kind: ConfigKind, doc: ConfigDoc) => {
  res.writeHead(status, { 'Content-Type': 'application/json', ETag: `"${doc.version}"` })
  res.end(JSON.stringify(shown(kind, doc)))
}

async function handleConfig(req: IncomingMessage, res: ServerResponse, url: URL) {
  const match = /^\/admin\/config\/(agents|tools)(?:\/([^/]+))?$/.exec(url.pathname)
  if (!match) return false
  const kind = match[1] as ConfigKind
  const id = match[2] === undefined ? undefined : decodeURIComponent(match[2])
  const store = configs[kind]
  const refuse = (refusal: Refusal) => sendJson(res, refusal.status, refusal.body)

  if (id === undefined && req.method === 'GET') {
    const offset = Number(url.searchParams.get('offset') ?? 0)
    const limit = Number(url.searchParams.get('limit') ?? 50)
    sendJson(res, 200, {
      items: store.slice(offset, offset + limit).map((doc) => shown(kind, doc)),
      total: store.length,
      offset,
      limit
    })
    return true
  }
  const check = (doc: Record<string, unknown>, current?: ConfigDoc) =>
    kind === 'agents' ? checkAgent(doc) : checkTool(doc, current)
  // Corpo como objeto JSON, sem operador `$`; a `version` do corpo é descartada.
  const body = async (): Promise<Checked<Record<string, unknown>>> => {
    const raw = await readJson(req)
    if (!isRecord(raw) || hasOperator(raw)) return invalid()
    const { version: _ignored, ...rest } = raw
    void _ignored
    return accepted(rest)
  }

  if (id === undefined && req.method === 'POST') {
    const received = await body()
    const doc = received.ok ? check(received.value) : received
    if (!doc.ok) refuse(doc.refusal)
    else if (store.some((item) => item.id === doc.value.id))
      refuse({ status: 409, body: { detail: 'Já existe config com este id' } })
    else {
      const created = { ...doc.value, version: 1 }
      store.push(created)
      sendConfig(res, 201, kind, created)
    }
    return true
  }
  if (id === undefined) return false

  const index = store.findIndex((item) => item.id === id)
  if (req.method === 'GET') {
    if (index === -1) refuse({ status: 404, body: { detail: 'Config não encontrada' } })
    else sendConfig(res, 200, kind, store[index])
    return true
  }
  if (req.method !== 'PUT' && req.method !== 'DELETE') return false
  const ifMatch = req.headers['if-match']
  if (ifMatch === undefined) {
    refuse({ status: 428, body: { detail: 'If-Match obrigatório' } })
    return true
  }
  if (index === -1) {
    refuse({ status: 404, body: { detail: 'Config não encontrada' } })
    return true
  }
  const current = store[index]
  if (ifMatch.replace(/^"(.*)"$/, '$1') !== String(current.version)) {
    refuse({ status: 412, body: { detail: 'Versão divergente: releia a config' } })
    return true
  }

  if (req.method === 'PUT') {
    const received = await body()
    const sameId = !received.ok || received.value.id === undefined || received.value.id === id
    const doc = !sameId ? invalid('id') : received.ok ? check({ ...received.value, id }, current) : received
    if (!doc.ok) refuse(doc.refusal)
    else {
      const replaced = { ...doc.value, version: current.version + 1 }
      store[index] = replaced
      sendConfig(res, 200, kind, replaced)
    }
    return true
  }

  const users = usedBy(kind, id)
  if (users) {
    refuse({ status: 409, body: { detail: 'Config em uso', used_by: users } })
    return true
  }
  if (url.searchParams.get('hard') === 'true') {
    store.splice(index, 1)
    res.writeHead(204).end()
    return true
  }
  const deactivated = { ...current, active: false, version: current.version + 1 }
  store[index] = deactivated
  sendConfig(res, 200, kind, deactivated)
  return true
}

// GET /metrics do AgentOS: 90 dias até hoje (UTC), determinísticos. Como no
// agno, ele só lê agregados prontos: o dia de hoje só aparece depois do primeiro
// POST /metrics/refresh (`refreshed`). Hoje: 3
// sessões de agent, 1 de team, 3 usuários, 1000 tokens; cada dia anterior: 1
// sessão de agent, 1 usuário, 100 tokens. Assim o filtro de período muda os
// números: today = 4 sessões, 7d = 10 (1600 tokens), 30d = 33 (3900), 90d = 93.
let refreshed = false
const DAY_MS = 24 * 60 * 60 * 1000
const metricsFor = (startingDate: string | null, endingDate: string | null) => {
  const todayMs = Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`)
  return Array.from({ length: 90 }, (_, ago) => {
    const date = new Date(todayMs - ago * DAY_MS).toISOString().slice(0, 10)
    const today = ago === 0
    return {
      id: date,
      agent_runs_count: 0,
      agent_sessions_count: today ? 3 : 1,
      team_runs_count: 0,
      team_sessions_count: today ? 1 : 0,
      workflow_runs_count: 0,
      workflow_sessions_count: 0,
      users_count: today ? 3 : 1,
      token_metrics: { total_tokens: today ? 1000 : 100 },
      model_metrics: [
        { model_id: 'fake-model', model_provider: 'Fake', count: today ? 4 : 1 }
      ],
      date: `${date}T00:00:00Z`,
      created_at: `${date}T12:00:00Z`,
      updated_at: `${date}T12:00:00Z`
    }
  })
    .filter(
      ({ date }) =>
        (refreshed || date < new Date(todayMs).toISOString().slice(0, 10)) &&
        (!startingDate || date >= startingDate) && (!endingDate || date <= endingDate)
    )
    .reverse()
}

const sendJson = (res: ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*'
  })
  res.end(JSON.stringify(body))
}

const notFound = (res: ServerResponse) =>
  sendJson(res, 404, { detail: 'Not Found' })

const readFormData = async (req: IncomingMessage) => {
  const chunks: Uint8Array[] = []
  for await (const chunk of req) chunks.push(chunk as Uint8Array)
  const request = new Request(`http://${HOST}`, {
    method: 'POST',
    headers: { 'content-type': req.headers['content-type'] ?? '' },
    body: new Blob(chunks)
  })
  return request.formData()
}

const delay = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms))

// Mesmo framing SSE do AgentOS (agno/os/utils.py: format_sse_event).
const writeEvent = (res: ServerResponse, payload: Record<string, unknown>) =>
  res.write(`event: ${payload.event}\ndata: ${JSON.stringify(payload)}\n\n`)

const runAgent = async (
  req: IncomingMessage,
  res: ServerResponse,
  agent: FakeAgent,
  kind: 'agent' | 'team' = 'agent'
) => {
  const form = await readFormData(req)
  const message = String(form.get('message') ?? '')
  const sessionId = String(form.get('session_id') ?? '') || randomUUID()
  const now = new Date().toISOString()
  const agentSessions = sessionsByAgent.get(agent.id) ?? []
  if (!agentSessions.some((s) => s.session_id === sessionId)) {
    sessionsByAgent.set(agent.id, [
      ...agentSessions,
      {
        session_id: sessionId,
        session_name: message,
        created_at: now,
        updated_at: now
      }
    ])
  }

  // No team os eventos levam o prefixo Team (TeamRunStarted, TeamRunContent…).
  const event = (name: string) => (kind === 'team' ? `Team${name}` : name)
  let finished = false
  res.on('close', () => {
    if (!finished) abortedRuns.push({ entity: agent.id, message })
  })
  const base = {
    ...(kind === 'team'
      ? { team_id: agent.id, team_name: agent.name }
      : { agent_id: agent.id, agent_name: agent.name }),
    run_id: randomUUID(),
    session_id: sessionId,
    created_at: Math.floor(Date.now() / 1000)
  }
  const deltas = [`${agent.name} `, 'recebeu: ', message]
  // Tools e métricas no formato do agno 2.5 (ToolExecution e RunMetrics em
  // agno/metrics.py): uma tool ok e uma com erro por resposta (P1-06).
  const tool = (name: string) => ({
    tool_call_id: `${base.run_id}-${name}`,
    tool_name: name,
    tool_args: {}
  })
  const toolOk = tool('consultar_pedido')
  const toolError = tool('abrir_troca')

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Access-Control-Allow-Origin': '*'
  })
  writeEvent(res, { ...base, event: event('RunStarted'), model: 'fake-model' })
  writeEvent(res, { ...base, event: event('ToolCallStarted'), tool: toolOk })
  await delay(CHUNK_DELAY_MS)
  writeEvent(res, {
    ...base,
    event: event('ToolCallCompleted'),
    tool: { ...toolOk, tool_call_error: false, metrics: { duration: 0.18 } }
  })
  for (const [index, delta] of deltas.entries()) {
    if (index === deltas.length - 1) {
      // A 2ª tool fica "executando" enquanto o stream está retido.
      writeEvent(res, { ...base, event: event('ToolCallStarted'), tool: toolError })
      if (message === HOLD_UNTIL_RELEASE_MESSAGE) await waitForRelease(agent.id)
      await delay(CHUNK_DELAY_MS)
      writeEvent(res, {
        ...base,
        event: event('ToolCallCompleted'),
        tool: { ...toolError, tool_call_error: true, metrics: { duration: 0.05 } }
      })
    }
    await delay(CHUNK_DELAY_MS)
    writeEvent(res, {
      ...base,
      event: event('RunContent'),
      content: delta,
      content_type: 'str'
    })
  }
  await delay(
    message === HOLD_COMPLETION_MESSAGE ? HOLD_COMPLETION_MS : CHUNK_DELAY_MS
  )
  writeEvent(res, {
    ...base,
    event: event('RunCompleted'),
    content: deltas.join(''),
    content_type: 'str',
    metrics: {
      input_tokens: 600,
      output_tokens: 212,
      total_tokens: 812,
      duration: 1.4
    }
  })
  finished = true
  historyBySession.set(sessionId, [
    ...(historyBySession.get(sessionId) ?? []),
    { role: 'user', content: message, created_at: base.created_at },
    { role: 'assistant', content: deltas.join(''), created_at: base.created_at }
  ])
  res.end()
}

const handle = async (req: IncomingMessage, res: ServerResponse) => {
  const url = new URL(req.url ?? '/', `http://${HOST}`)
  const route = `${req.method} ${url.pathname}`

  if (!TEST_ROUTES.has(route) && !TEST_CONFIG_ROUTE.test(route)) {
    const key = /^Bearer (.+)$/.exec(req.headers.authorization ?? '')?.[1]
    if (key !== RUN_KEY && key !== ADMIN_KEY)
      return sendJson(res, 401, { detail: 'unauthorized' })
    const adminOnly =
      /^\/(admin|metrics)(\/|$)/.test(url.pathname) ||
      (req.method === 'DELETE' && /^\/sessions(\/|$)/.test(url.pathname))
    if (adminOnly && key !== ADMIN_KEY) return sendJson(res, 403, { detail: 'forbidden' })
  }

  if (route === 'GET /aborts') return sendJson(res, 200, abortedRuns)
  if (route === 'GET /admin/schema') return sendJson(res, 200, SCHEMA_DOCUMENT)
  const raw = TEST_CONFIG_ROUTE.exec(route)
  if (raw) {
    const doc = configs[raw[1] as ConfigKind].find((item) => item.id === decodeURIComponent(raw[2]))
    return doc ? sendJson(res, 200, doc) : notFound(res)
  }
  if (await handleConfig(req, res, url)) return
  if (route === 'GET /status')
    return sendJson(res, 200, { status: 'available' })
  // HealthResponse do AgentOS (docs/contracts/orchestrator-openapi.json).
  if (route === 'GET /health')
    return sendJson(res, 200, { status: 'ok', instantiated_at: startedAt })
  if (route === 'GET /agents')
    return sendJson(res, 200, agents.map(toAgentResponse))
  if (route === 'POST /metrics/refresh') {
    refreshed = true
    return sendJson(res, 200, metricsFor(null, null))
  }
  if (route === 'GET /metrics')
    return sendJson(res, 200, {
      metrics: metricsFor(
        url.searchParams.get('starting_date'),
        url.searchParams.get('ending_date')
      ),
      updated_at: null
    })
  if (route === 'GET /teams') return sendJson(res, 200, teams.map(toAgentResponse))
  if (route === 'POST /hold/release') {
    const only = url.searchParams.get('agent')
    const released = [...heldStreams]
      .filter(([, agentId]) => only === null || agentId === only)
      .map(([release]) => release)
    released.forEach((release) => release())
    return sendJson(res, 200, { released: released.length })
  }
  if (route === 'GET /sessions') {
    const componentId = url.searchParams.get('component_id') ?? ''
    const owners = url.searchParams.get('type') === 'team' ? teams : agents
    const data = owners.some((owner) => owner.id === componentId)
      ? (sessionsByAgent.get(componentId) ?? [])
      : []
    return sendJson(res, 200, {
      data,
      meta: { page: 1, limit: 20, total_pages: 1, total_count: data.length }
    })
  }

  const session = /^GET \/sessions\/([^/]+)$/.exec(route)
  const history = session && historyBySession.get(session[1])
  if (history) return sendJson(res, 200, { chat_history: history })

  const removed = /^DELETE \/sessions\/([^/]+)$/.exec(route)
  if (removed) {
    for (const [owner, list] of sessionsByAgent)
      sessionsByAgent.set(owner, list.filter((s) => s.session_id !== removed[1]))
    historyBySession.delete(removed[1])
    res.writeHead(204).end()
    return
  }

  const run = /^POST \/agents\/([^/]+)\/runs$/.exec(route)
  const agent = run && agents.find((a) => a.id === run[1])
  if (agent) return runAgent(req, res, agent)
  const teamRun = /^POST \/teams\/([^/]+)\/runs$/.exec(route)
  const team = teamRun && teams.find((t) => t.id === teamRun[1])
  if (team) return runAgent(req, res, team, 'team')

  return notFound(res)
}

createServer((req, res) => {
  handle(req, res).catch((error: unknown) => {
    console.error(
      '[fake-orchestrator] falha ao responder',
      req.method,
      req.url,
      error
    )
    if (!res.headersSent)
      sendJson(res, 500, { detail: 'Fake orchestrator error' })
    else res.end()
  })
}).listen(PORT, HOST, () => {
  console.log(`[fake-orchestrator] ouvindo em http://${HOST}:${PORT}`)
})
