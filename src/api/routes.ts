// Rotas do BFF do chat (P2-03): o browser só fala com o próprio app; URL e
// chaves do orquestrador ficam em src/server.
const BASE = '/api/playground'

export type ChatKind = 'agent' | 'team'

export const APIRoutes = {
  Entities: (kind: ChatKind) => `${BASE}/${kind}s`,
  Run: (kind: ChatKind, id: string) =>
    `${BASE}/${kind}s/${encodeURIComponent(id)}/runs`,
  Sessions: (kind: ChatKind, componentId: string) =>
    `${BASE}/sessions?${new URLSearchParams({ type: kind, component_id: componentId })}`,
  Session: (sessionId: string, kind?: ChatKind) =>
    `${BASE}/sessions/${encodeURIComponent(sessionId)}${kind ? `?type=${kind}` : ''}`
}
