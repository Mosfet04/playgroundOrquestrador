import { useCallback } from 'react'

import { usePlaygroundStore } from '../store'

import { type PlaygroundChatMessage } from '@/types/playground'
import {
  PlaygroundRequestError,
  getPlaygroundEntitiesAPI
} from '@/api/playground'
import { useQueryState } from 'nuqs'

const useChatActions = () => {
  const { chatInputRef } = usePlaygroundStore()
  const [, setSessionId] = useQueryState('session')
  const setMessages = usePlaygroundStore((state) => state.setMessages)
  const setIsOrchestratorActive = usePlaygroundStore(
    (state) => state.setIsOrchestratorActive
  )
  const setIsOrchestratorLoading = usePlaygroundStore(
    (state) => state.setIsOrchestratorLoading
  )
  const setOrchestratorErrorStatus = usePlaygroundStore(
    (state) => state.setOrchestratorErrorStatus
  )
  const setAgents = usePlaygroundStore((state) => state.setAgents)
  const setTeams = usePlaygroundStore((state) => state.setTeams)
  const setHasStorage = usePlaygroundStore((state) => state.setHasStorage)
  const setMode = usePlaygroundStore((state) => state.setMode)
  const [agentId, setAgentId] = useQueryState('agent')
  const [teamId, setTeamId] = useQueryState('team')

  // Nova conversa (ou outra entidade): o run em andamento é abortado
  // (D-P2-03-4, decisão 0020).
  const clearChat = useCallback(() => {
    usePlaygroundStore.getState().runAbortController?.abort()
    setMessages([])
    setSessionId(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const focusChatInput = useCallback(() => {
    setTimeout(() => {
      requestAnimationFrame(() => chatInputRef?.current?.focus())
    }, 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const addMessage = useCallback(
    (message: PlaygroundChatMessage) => {
      setMessages((prevMessages) => [...prevMessages, message])
    },
    [setMessages]
  )

  // Agents e teams pelo BFF (P2-03). Qualquer das listas falhando é o
  // orquestrador fora: o status (ou "offline") vai para o bloco de erro.
  const initializePlayground = useCallback(async () => {
    setIsOrchestratorLoading(true)
    // A URL manda no modo; com ?agent= e ?team= juntos vale ?agent=.
    if (agentId) setMode('agent')
    else if (teamId) setMode('team')
    try {
      const [agents, teams] = await Promise.all([
        getPlaygroundEntitiesAPI('agent'),
        getPlaygroundEntitiesAPI('team')
      ])
      setIsOrchestratorActive(true)
      setOrchestratorErrorStatus(undefined)

      if (!agentId && !teamId) {
        const currentMode = usePlaygroundStore.getState().mode
        const pickTeam =
          teams.length > 0 && (currentMode === 'team' || agents.length === 0)
        if (pickTeam) {
          setMode('team')
          setTeamId(teams[0].value)
          setHasStorage(!!teams[0].storage)
        } else if (agents.length > 0) {
          setMode('agent')
          setAgentId(agents[0].value)
          setHasStorage(!!agents[0].storage)
        }
      }
      setAgents(agents)
      setTeams(teams)
      return { agents, teams }
    } catch (error) {
      // ?agent=/?team= (e o modo) ficam: a sessão da URL volta com o
      // orquestrador (LIM-P1-03-1, D-P1-06-4).
      console.error('Error initializing playground:', error)
      setOrchestratorErrorStatus(
        error instanceof PlaygroundRequestError ? error.status : undefined
      )
      setIsOrchestratorActive(false)
      setHasStorage(false)
      setAgents([])
      setTeams([])
    } finally {
      setIsOrchestratorLoading(false)
    }
  }, [
    setIsOrchestratorActive,
    setIsOrchestratorLoading,
    setOrchestratorErrorStatus,
    setAgents,
    setTeams,
    setAgentId,
    setHasStorage,
    setMode,
    setTeamId,
    agentId,
    teamId
  ])

  return {
    clearChat,
    addMessage,
    focusChatInput,
    initializePlayground
  }
}

export default useChatActions
