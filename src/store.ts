import { create } from 'zustand'

import {
  type PlaygroundChatMessage,
  type SessionEntry
} from '@/types/playground'

interface Agent {
  value: string
  label: string
  model: {
    provider: string
    model?: string
  }
  storage?: boolean
}

export interface Team {
  value: string
  label: string
  model: {
    provider: string
    model?: string
  }
  storage?: boolean
}

// Erro do stream (P1-04b): o tipo, traduzido pela bolha ao renderizar, e o
// texto do orquestrador (content do RunError), que é dado e não se traduz.
// Nulo: erro sem tipo conhecido. `unavailable`: o BFF respondeu 503/504;
// `interrupted`: o stream acabou sem o fim do run; `network`: sem resposta do
// servidor do playground (P2-03).
export interface StreamingError {
  kind:
    | 'noEntity'
    | 'cancelled'
    | 'runError'
    | 'network'
    | 'unavailable'
    | 'interrupted'
  detail?: string
}

interface PlaygroundStore {
  streamingErrorMessage: StreamingError | null
  setStreamingErrorMessage: (
    streamingErrorMessage: StreamingError | null
  ) => void
  isStreaming: boolean
  setIsStreaming: (isStreaming: boolean) => void
  /** Run em andamento: abortado ao trocar de conversa ou sair (decisão 0020). */
  runAbortController: AbortController | null
  setRunAbortController: (controller: AbortController | null) => void
  isOrchestratorActive: boolean
  setIsOrchestratorActive: (isActive: boolean) => void
  isOrchestratorLoading: boolean
  setIsOrchestratorLoading: (isLoading: boolean) => void
  /** HTTP da falha da carga inicial; sem ele, "offline" (P2-03). */
  orchestratorErrorStatus: number | undefined
  setOrchestratorErrorStatus: (status: number | undefined) => void
  messages: PlaygroundChatMessage[]
  setMessages: (
    messages:
      | PlaygroundChatMessage[]
      | ((prevMessages: PlaygroundChatMessage[]) => PlaygroundChatMessage[])
  ) => void
  hasStorage: boolean
  setHasStorage: (hasStorage: boolean) => void
  chatInputRef: React.RefObject<HTMLTextAreaElement | null>
  agents: Agent[]
  setAgents: (agents: Agent[]) => void
  teams: Team[]
  setTeams: (teams: Team[]) => void
  mode: 'agent' | 'team'
  setMode: (mode: 'agent' | 'team') => void
  sessionsData: SessionEntry[] | null
  setSessionsData: (
    sessionsData:
      | SessionEntry[]
      | ((prevSessions: SessionEntry[] | null) => SessionEntry[] | null)
  ) => void
  isSessionsLoading: boolean
  setIsSessionsLoading: (isSessionsLoading: boolean) => void
  /** Falha ao carregar a lista de sessões (caixa de sessões, P1-05). */
  sessionsError: boolean
  setSessionsError: (sessionsError: boolean) => void
}

export const usePlaygroundStore = create<PlaygroundStore>()((set) => ({
  streamingErrorMessage: null,
  setStreamingErrorMessage: (streamingErrorMessage) =>
    set(() => ({ streamingErrorMessage })),
  isStreaming: false,
  setIsStreaming: (isStreaming) => set(() => ({ isStreaming })),
  runAbortController: null,
  setRunAbortController: (runAbortController) =>
    set(() => ({ runAbortController })),
  isOrchestratorActive: false,
  setIsOrchestratorActive: (isActive) =>
    set(() => ({ isOrchestratorActive: isActive })),
  isOrchestratorLoading: true,
  setIsOrchestratorLoading: (isLoading) =>
    set(() => ({ isOrchestratorLoading: isLoading })),
  orchestratorErrorStatus: undefined,
  setOrchestratorErrorStatus: (orchestratorErrorStatus) =>
    set(() => ({ orchestratorErrorStatus })),
  messages: [],
  setMessages: (messages) =>
    set((state) => ({
      messages:
        typeof messages === 'function' ? messages(state.messages) : messages
    })),
  hasStorage: false,
  setHasStorage: (hasStorage) => set(() => ({ hasStorage })),
  chatInputRef: { current: null },
  agents: [],
  setAgents: (agents) => set({ agents }),
  teams: [],
  setTeams: (teams) => set({ teams }),
  mode: 'agent',
  setMode: (mode) => set(() => ({ mode })),
  sessionsData: null,
  setSessionsData: (sessionsData) =>
    set((state) => ({
      sessionsData:
        typeof sessionsData === 'function'
          ? sessionsData(state.sessionsData)
          : sessionsData
    })),
  isSessionsLoading: false,
  setIsSessionsLoading: (isSessionsLoading) =>
    set(() => ({ isSessionsLoading })),
  sessionsError: false,
  setSessionsError: (sessionsError) => set(() => ({ sessionsError }))
}))
