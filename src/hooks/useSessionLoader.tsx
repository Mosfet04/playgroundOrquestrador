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

const useSessionLoader = () => {
  const setMessages = usePlaygroundStore((state) => state.setMessages)
  const setIsSessionsLoading = usePlaygroundStore(
    (state) => state.setIsSessionsLoading
  )
  const setSessionsData = usePlaygroundStore((state) => state.setSessionsData)
  const setSessionsError = usePlaygroundStore((state) => state.setSessionsError)

  const getSessions = useCallback(
    async ({ entityType, agentId, teamId }: LoaderArgs) => {
      const kind = entityType === 'team' ? 'team' : 'agent'
      const componentId = kind === 'team' ? teamId : agentId
      if (!componentId) return
      try {
        // A falha anterior só sai com sucesso: no "Tentar de novo" a caixa de
        // erro fica no lugar, com o botão em "Tentando…" (P1-05).
        setIsSessionsLoading(true)
        setSessionsData(await getPlaygroundSessionsAPI(kind, componentId))
        setSessionsError(false)
      } catch (error) {
        // A falha aparece na caixa de sessões, com "Tentar de novo" (P1-05).
        console.error('Error loading sessions:', error)
        setSessionsError(true)
        setSessionsData([])
      } finally {
        setIsSessionsLoading(false)
      }
    },
    [setSessionsData, setIsSessionsLoading, setSessionsError]
  )

  // Histórico da sessão: o BFF já devolve só user/assistant.
  const getSession = useCallback(
    async ({ entityType }: LoaderArgs, sessionId: string) => {
      if (!sessionId) return
      try {
        const { chat_history } = await getPlaygroundSessionAPI(
          entityType === 'team' ? 'team' : 'agent',
          sessionId
        )
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
        return null
      }
    },
    [setMessages]
  )

  return { getSession, getSessions }
}

export default useSessionLoader
