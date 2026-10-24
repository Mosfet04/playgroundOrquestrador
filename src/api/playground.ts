import { APIRoutes, type ChatKind } from './routes'

import type { ComboboxAgent, SessionEntry } from '@/types/playground'

// Falha do BFF do chat. `status` é o HTTP devolvido; sem ele, nada respondeu
// (rede, orquestrador fora do ar ou fora do prazo) e a UI mostra "offline".
export class PlaygroundRequestError extends Error {
  constructor(
    readonly status?: number,
    options?: ErrorOptions
  ) {
    super(
      status === undefined ? 'Sem resposta do orquestrador' : `HTTP ${status}`,
      options
    )
  }
}

const OFFLINE_ERRORS = ['unreachable', 'timeout']

// Sessão do playground expirada (401 do middleware): navegação completa para
// o login, que volta para esta URL (docs/design/P2-03.md). A promessa não
// resolve: a página está saindo e nada mais deve reagir.
export function redirectToLogin(): Promise<never> {
  const next = `${window.location.pathname}${window.location.search}`
  window.location.assign(
    `/login?reason=expired&next=${encodeURIComponent(next)}`
  )
  return new Promise<never>(() => {})
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(url, init)
  } catch (error) {
    throw new PlaygroundRequestError(undefined, { cause: error })
  }
  if (response.status === 401) return redirectToLogin()
  const body = (await response.json().catch(() => null)) as {
    data?: T
    error?: string
  } | null
  if (!response.ok) {
    const offline = OFFLINE_ERRORS.includes(body?.error ?? '')
    throw new PlaygroundRequestError(offline ? undefined : response.status)
  }
  return body?.data as T
}

export const getPlaygroundEntitiesAPI = (kind: ChatKind) =>
  request<ComboboxAgent[]>(APIRoutes.Entities(kind))

export const getPlaygroundSessionsAPI = (kind: ChatKind, componentId: string) =>
  request<SessionEntry[]>(APIRoutes.Sessions(kind, componentId))

export const getPlaygroundSessionAPI = (kind: ChatKind, sessionId: string) =>
  request<{
    chat_history: {
      role?: string
      content: unknown
      created_at?: number | null
    }[]
  }>(APIRoutes.Session(sessionId, kind))

export const deletePlaygroundSessionAPI = (sessionId: string) =>
  request<undefined>(APIRoutes.Session(sessionId), { method: 'DELETE' })
