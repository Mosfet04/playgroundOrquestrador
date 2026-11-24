import { useCallback } from 'react'
import {
  getPlaygroundSessionAPI,
  getPlaygroundSessionsAPI
} from '@/api/playground'
import { usePlaygroundStore } from '../store'
import { PlaygroundChatMessage } from '@/types/playground'
import { getJsonMarkdown } from '@/lib/utils'

interface LoaderArgs {
  entityType: 'agent' | 'team' | null
  agentId?: string | null
  teamId?: string | null
}

// Conteúdo do histórico: texto, partes `{ type: 'text' }` juntas ou, outro
// formato, o JSON em bloco de código.
const toText = (content: unknown): string => {
  if (typeof content === 'string') return content
  if (Array.isArray(content))
    return content
      .filter((item: { type?: unknown }) => item?.type === 'text')
      .map((item: { text?: unknown }) => String(item.text ?? ''))
      .join(' ')
  return getJsonMarkdown(content as object)
}

// Pedido de lista mais recente, entre todas as instâncias do hook: a resposta
// de um pedido anterior (outra entidade, a releitura do fim do run) chega
// atrasada e não escreve por cima. `latestIsQuiet`: esse pedido é a releitura
// do fim do run.
let latestSessionsRequest = 0
let latestIsQuiet = false

const useSessionLoader = () => {
  const setMessages = usePlaygroundStore((state) => state.setMessages)
  const setLoadedSessionId = usePlaygroundStore(
    (state) => state.setLoadedSessionId
  )
  const setIsSessionsLoading = usePlaygroundStore(
    (state) => state.setIsSessionsLoading
  )
  const setSessionsData = usePlaygroundStore((state) => state.setSessionsData)
  const setSessionsError = usePlaygroundStore((state) => state.setSessionsError)

  // `quiet`: a releitura do fim do run, com a lista na tela; sem o
  // carregamento (que a troca pelo skeleton) e, na falha, a lista fica.
  const getSessions = useCallback(
    async ({ entityType, agentId, teamId }: LoaderArgs, { quiet = false } = {}) => {
      const kind = entityType === 'team' ? 'team' : 'agent'
      const componentId = kind === 'team' ? teamId : agentId
      if (!componentId) return
      const request = ++latestSessionsRequest
      latestIsQuiet = quiet
      const isLatest = () => request === latestSessionsRequest
      try {
        // A falha anterior só sai com sucesso: no "Tentar de novo" a caixa de
        // erro fica no lugar, com o botão em "Tentando…" (P1-05).
        if (!quiet) setIsSessionsLoading(true)
        const sessions = await getPlaygroundSessionsAPI(kind, componentId)
        if (!isLatest()) return
        setSessionsData(sessions)
        setSessionsError(false)
      } catch (error) {
        // A falha aparece na caixa de sessões, com "Tentar de novo" (P1-05).
        console.error('Error loading sessions:', error)
        if (!isLatest() || quiet) return
        setSessionsError(true)
        setSessionsData([])
      } finally {
        if (isLatest()) setIsSessionsLoading(false)
      }
    },
    [setSessionsData, setIsSessionsLoading, setSessionsError]
  )

  // Sessão excluída sai da lista. A releitura do fim do run a caminho foi lida
  // antes do DELETE e a traria de volta: deixa de valer (e o carregamento que
  // ela encerraria acaba aqui). A carga de outra entidade segue valendo.
  const removeSession = useCallback(
    (sessionId: string) => {
      if (latestIsQuiet) {
        latestSessionsRequest++
        setIsSessionsLoading(false)
      }
      setSessionsData(
        (prev) => prev?.filter((session) => session.session_id !== sessionId) ?? null
      )
    },
    [setSessionsData, setIsSessionsLoading]
  )

  // Histórico da sessão: o BFF já devolve só user/assistant.
  const getSession = useCallback(
    async ({ entityType }: LoaderArgs, sessionId: string) => {
      if (!sessionId) return
      setLoadedSessionId(sessionId)
      try {
        const { chat_history } = await getPlaygroundSessionAPI(
          entityType === 'team' ? 'team' : 'agent',
          sessionId
        )
        // A URL pode ter deixado esta sessão (outra, nenhuma, página fechada)
        // durante o GET: a resposta atrasada não escreve na conversa de agora.
        if (usePlaygroundStore.getState().loadedSessionId !== sessionId) return
        const messages: PlaygroundChatMessage[] = chat_history
          .filter((entry) => entry.content != null && entry.content !== '')
          .map((entry) => ({
            role: entry.role === 'user' ? 'user' : 'agent',
            content: toText(entry.content),
            created_at: entry.created_at ?? Math.floor(Date.now() / 1000)
          }))
        if (messages.length > 0) {
          setMessages(messages)
          return messages
        }
      } catch (error) {
        console.error('Error loading session:', error)
        if (usePlaygroundStore.getState().loadedSessionId === sessionId)
          setLoadedSessionId(null)
        return null
      }
    },
    [setMessages, setLoadedSessionId]
  )

  return { getSession, getSessions, removeSession }
}

export default useSessionLoader
