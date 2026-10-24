'use client'

import { useEffect } from 'react'
import { useQueryState } from 'nuqs'

import useChatActions from '@/hooks/useChatActions'
import useSessionLoader from '@/hooks/useSessionLoader'
import { usePlaygroundStore } from '@/store'
import ChatInput from './ChatInput'
import MessageArea from './MessageArea'

// A carga do playground mora aqui, montado uma vez por /playground. As
// Sidebars (a da página e a do Sheet abaixo de lg) só renderizam: uma 2ª
// instância refazendo a carga trocava a mensagem em stream pelo histórico.
const ChatArea = () => {
  const { initializePlayground } = useChatActions()
  const { getSessions, getSession } = useSessionLoader()
  const {
    mode,
    hasStorage,
    isOrchestratorActive,
    isOrchestratorLoading,
    setSessionsData,
    setSessionsError
  } = usePlaygroundStore()
  const [agentId] = useQueryState('agent')
  const [teamId] = useQueryState('team')
  const [sessionId] = useQueryState('session')

  useEffect(() => {
    initializePlayground()
  }, [initializePlayground])

  // Sair da página ou a entidade da URL mudar (cartão, modo, Voltar/Avançar)
  // aborta o run em andamento (D-P2-03-4, decisão 0020).
  useEffect(
    () => () => usePlaygroundStore.getState().runAbortController?.abort(),
    [agentId, teamId]
  )

  // Sessão da URL (?session=) quando o orquestrador responde: ao abrir e ao
  // voltar depois de fora do ar (LIM-P1-03-1, D-P1-06-4).
  useEffect(() => {
    if (isOrchestratorActive && sessionId && (agentId || teamId)) {
      const entityType = agentId ? 'agent' : 'team'
      getSession({ entityType, agentId, teamId }, sessionId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOrchestratorActive])

  useEffect(() => {
    // A falha da entidade anterior não vale para a nova (caixa de sessões).
    setSessionsError(false)
    if (!hasStorage || isOrchestratorLoading) return
    setSessionsData(() => null)
    if (agentId || teamId) getSessions({ entityType: mode, agentId, teamId })
  }, [
    agentId,
    teamId,
    mode,
    isOrchestratorLoading,
    hasStorage,
    getSessions,
    setSessionsData,
    setSessionsError
  ])

  return (
    <div className="relative flex min-h-0 min-w-0 flex-grow flex-col">
      <MessageArea />

      <div className="sticky bottom-0 px-3 pb-4 pt-3 lg:px-6 lg:pb-6 lg:pt-4">
        <ChatInput />
      </div>
    </div>
  )
}

export default ChatArea
