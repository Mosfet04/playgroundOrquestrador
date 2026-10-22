// Orquestrador falso para os testes E2E: imita só os endpoints do AgentOS
// (agno 2.5) que o chat do playground chama hoje (src/api/playground.ts e
// src/hooks/useAIStreamHandler.tsx). Estado em memória; rota desconhecida => 404.
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
  agent: FakeAgent
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

  const base = {
    agent_id: agent.id,
    agent_name: agent.name,
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
  writeEvent(res, { ...base, event: 'RunStarted', model: 'fake-model' })
  writeEvent(res, { ...base, event: 'ToolCallStarted', tool: toolOk })
  await delay(CHUNK_DELAY_MS)
  writeEvent(res, {
    ...base,
    event: 'ToolCallCompleted',
    tool: { ...toolOk, tool_call_error: false, metrics: { duration: 0.18 } }
  })
  for (const [index, delta] of deltas.entries()) {
    if (index === deltas.length - 1) {
      // A 2ª tool fica "executando" enquanto o stream está retido.
      writeEvent(res, { ...base, event: 'ToolCallStarted', tool: toolError })
      if (message === HOLD_UNTIL_RELEASE_MESSAGE) await waitForRelease(agent.id)
      await delay(CHUNK_DELAY_MS)
      writeEvent(res, {
        ...base,
        event: 'ToolCallCompleted',
        tool: { ...toolError, tool_call_error: true, metrics: { duration: 0.05 } }
      })
    }
    await delay(CHUNK_DELAY_MS)
    writeEvent(res, {
      ...base,
      event: 'RunContent',
      content: delta,
      content_type: 'str'
    })
  }
  await delay(
    message === HOLD_COMPLETION_MESSAGE ? HOLD_COMPLETION_MS : CHUNK_DELAY_MS
  )
  writeEvent(res, {
    ...base,
    event: 'RunCompleted',
    content: deltas.join(''),
    content_type: 'str',
    metrics: {
      input_tokens: 600,
      output_tokens: 212,
      total_tokens: 812,
      duration: 1.4
    }
  })
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

  if (route === 'GET /status')
    return sendJson(res, 200, { status: 'available' })
  // HealthResponse do AgentOS (docs/contracts/orchestrator-openapi.json).
  if (route === 'GET /health')
    return sendJson(res, 200, { status: 'ok', instantiated_at: startedAt })
  if (route === 'GET /agents')
    return sendJson(res, 200, agents.map(toAgentResponse))
  if (route === 'GET /teams') return sendJson(res, 200, [])
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
    const data =
      url.searchParams.get('type') === 'agent'
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

  const run = /^POST \/agents\/([^/]+)\/runs$/.exec(route)
  const agent = run && agents.find((a) => a.id === run[1])
  if (agent) return runAgent(req, res, agent)

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
