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
    selectedEndpoint,
    hydrated,
    mode,
    hasStorage,
    isEndpointLoading,
    setSessionsData,
    setSessionsError
  } = usePlaygroundStore()
  const [agentId] = useQueryState('agent')
  const [teamId] = useQueryState('team')
  const [sessionId] = useQueryState('session')

  useEffect(() => {
    if (hydrated) initializePlayground()
  }, [selectedEndpoint, initializePlayground, hydrated])

  // Sessão da URL (?session=), uma vez ao hidratar o store.
  useEffect(() => {
    if (hydrated && sessionId && selectedEndpoint && (agentId || teamId)) {
      const entityType = agentId ? 'agent' : 'team'
      getSession({ entityType, agentId, teamId }, sessionId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated])

  useEffect(() => {
    // A falha da entidade anterior não vale para a nova (caixa de sessões).
    setSessionsError(false)
    if (!selectedEndpoint || !hasStorage || isEndpointLoading) return
    setSessionsData(() => null)
    if (agentId || teamId) getSessions({ entityType: mode, agentId, teamId })
  }, [
    selectedEndpoint,
    agentId,
    teamId,
    mode,
    isEndpointLoading,
    hasStorage,
    getSessions,
    setSessionsData,
    setSessionsError
  ])

  return (
    <div className="relative flex min-h-0 min-w-0 flex-grow flex-col rounded-lg bg-background lg:m-1.5">
      <MessageArea />

      <div className="sticky bottom-0 px-4 pb-2 lg:ml-9">
        <ChatInput />
      </div>
    </div>
  )
}

export default ChatArea
