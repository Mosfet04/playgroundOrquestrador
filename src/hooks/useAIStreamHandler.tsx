import { useCallback } from 'react'
import { useTranslations } from 'next-intl'

import { APIRoutes } from '@/api/routes'

import useChatActions from '@/hooks/useChatActions'
import { usePlaygroundStore, type StreamingError } from '../store'
import {
  RunEvent,
  RunResponseContent,
  type PlaygroundChatMessage,
  type RunMetrics,
  type RunResponse
} from '@/types/playground'
import useAIResponseStream from './useAIResponseStream'
import useSessionLoader from './useSessionLoader'
import { ToolCall } from '@/types/playground'
import { useQueryState } from 'nuqs'
import { getJsonMarkdown } from '@/lib/utils'
import {
  dropReasoningToolCall,
  mergeReasoningSteps,
  parseCompletedSteps,
  parseReasoningStep,
  parseReasoningSteps
} from '@/lib/reasoningSteps'

// Só os números da resposta (tempo e tokens); o resto do RunMetrics fica de
// fora. Sem nenhum deles, a mensagem fica sem métricas.
const pickRunMetrics = (metrics?: RunMetrics): RunMetrics | undefined => {
  const picked: RunMetrics = {}
  for (const key of ['duration', 'input_tokens', 'output_tokens'] as const) {
    if (typeof metrics?.[key] === 'number') picked[key] = metrics[key]
  }
  return Object.keys(picked).length > 0 ? picked : undefined
}

// Atualiza só a última mensagem, se for do agente (a bolha do run em curso).
const updateLastAgentMessage = (
  messages: PlaygroundChatMessage[],
  update: (message: PlaygroundChatMessage) => PlaygroundChatMessage
) =>
  messages.map((message, index) =>
    index === messages.length - 1 && message.role === 'agent' ? update(message) : message
  )

const useAIChatStreamHandler = () => {
  const setMessages = usePlaygroundStore((state) => state.setMessages)
  const { addMessage, focusChatInput } = useChatActions()
  const [agentId] = useQueryState('agent')
  const [teamId] = useQueryState('team')
  const [sessionId, setSessionId] = useQueryState('session')
  const mode = usePlaygroundStore((state) => state.mode)
  const setStreamingErrorMessage = usePlaygroundStore(
    (state) => state.setStreamingErrorMessage
  )
  const setIsStreaming = usePlaygroundStore((state) => state.setIsStreaming)
  const setRunAbortController = usePlaygroundStore(
    (state) => state.setRunAbortController
  )
  const setSessionsData = usePlaygroundStore((state) => state.setSessionsData)
  const setLoadedSessionId = usePlaygroundStore(
    (state) => state.setLoadedSessionId
  )
  const hasStorage = usePlaygroundStore((state) => state.hasStorage)
  const { streamResponse } = useAIResponseStream()
  const { getSessions } = useSessionLoader()
  const t = useTranslations('playground')

  const updateMessagesWithErrorState = useCallback(() => {
    setMessages((prevMessages) => {
      const newMessages = [...prevMessages]
      const lastMessage = newMessages[newMessages.length - 1]
      if (lastMessage && lastMessage.role === 'agent') {
        lastMessage.streamingError = true
      }
      return newMessages
    })
  }, [setMessages])
/**
 * Processes a new tool call and adds it to the message
 * @param toolCall - The tool call to add
 * @param prevToolCalls - The previous tool calls array
 * @returns Updated tool calls array
 */
const processToolCall = useCallback(
  (toolCall: ToolCall, prevToolCalls: ToolCall[] = []) => {
    const toolCallId =
      toolCall.tool_call_id || `${toolCall.tool_name}-${toolCall.created_at}`

    const existingToolCallIndex = prevToolCalls.findIndex(
      (tc) =>
        (tc.tool_call_id && tc.tool_call_id === toolCall.tool_call_id) ||
        (!tc.tool_call_id &&
          toolCall.tool_name &&
          toolCall.created_at &&
          `${tc.tool_name}-${tc.created_at}` === toolCallId)
    )
    if (existingToolCallIndex >= 0) {
      const updatedToolCalls = [...prevToolCalls]
      updatedToolCalls[existingToolCallIndex] = {
        ...updatedToolCalls[existingToolCallIndex],
        ...toolCall
      }
      return updatedToolCalls
    } else {
      return [...prevToolCalls, toolCall]
    }
  },
  []
)

  /**
   * Processes tool calls from a chunk, handling both single tool object and tools array formats
   * @param chunk - The chunk containing tool call data
   * @param existingToolCalls - The existing tool calls array
   * @returns Updated tool calls array
   */
  const processChunkToolCalls = useCallback(
    (
      chunk: RunResponseContent | RunResponse,
      existingToolCalls: ToolCall[] = []
    ) => {
      let updatedToolCalls = [...existingToolCalls]
      // Handle new single tool object format
      if (chunk.tool) {
        updatedToolCalls = processToolCall(chunk.tool, updatedToolCalls)
      }
      // Handle legacy tools array format
      if (chunk.tools && chunk.tools.length > 0) {
        for (const toolCall of chunk.tools) {
          updatedToolCalls = processToolCall(toolCall, updatedToolCalls)
        }
      }

      return updatedToolCalls
    },
    [processToolCall]
  )

  // `resent`: a mensagem do usuário que o Reenviar manda de novo (QA1-03); sai
  // do lugar e volta no fim, com a resposta, sem duplicar a pergunta.
  const handleStreamResponse = useCallback(
    async (messageText: string, resent?: PlaygroundChatMessage) => {
      setIsStreaming(true)
      // Abortado ao trocar de conversa ou sair da página (decisão 0020).
      const controller = new AbortController()
      setRunAbortController(controller)

      setMessages((prevMessages) => {
        let kept = prevMessages
        if (prevMessages.length >= 2) {
          const lastMessage = prevMessages[prevMessages.length - 1]
          const secondLastMessage = prevMessages[prevMessages.length - 2]
          if (
            lastMessage.role === 'agent' &&
            lastMessage.streamingError &&
            secondLastMessage.role === 'user'
          ) {
            kept = prevMessages.slice(0, -2)
          }
        }
        return resent ? kept.filter((message) => message !== resent) : kept
      })

      addMessage({
        role: 'user',
        content: messageText,
        created_at: Math.floor(Date.now() / 1000)
      })

      addMessage({
        role: 'agent',
        content: '',
        tool_calls: [],
        streamingError: false,
        created_at: Math.floor(Date.now() / 1000) + 1
      })

      let lastContent = ''
      let newSessionId = sessionId
      // Fim do run visto (completo, erro ou cancelado); sem ele, o stream foi
      // interrompido (docs/design/P2-03.md).
      let finished = false
      const failRun = (error: StreamingError | null) => {
        updateMessagesWithErrorState()
        setStreamingErrorMessage(error)
      }
      try {
        // O user_id vem da sessão do playground, no BFF (P2-03).
        const playgroundRunUrl =
          mode === 'team' && teamId
            ? APIRoutes.Run('team', teamId)
            : mode === 'agent' && agentId
              ? APIRoutes.Run('agent', agentId)
              : null

        if (!playgroundRunUrl) {
          updateMessagesWithErrorState()
          setStreamingErrorMessage({ kind: 'noEntity' })
          setIsStreaming(false)
          return
        }

        await streamResponse({
          apiUrl: playgroundRunUrl,
          requestBody: {
            message: messageText,
            ...(sessionId ? { session_id: sessionId } : {})
          },
          signal: controller.signal,
          onChunk: (chunk: RunResponse) => {
            const isDelta =
              chunk.event === RunEvent.RunContent ||
              chunk.event === RunEvent.TeamRunContent
            // No team, RunContent/RunCompleted vêm dos membros
            // (stream_member_events do agno) e não escrevem o texto do team
            const isTeamMemberEvent =
              mode === 'team' &&
              (chunk.event === RunEvent.RunContent ||
                chunk.event === RunEvent.RunCompleted)
            // Delta de membro ou sem texto (só raciocínio, citação ou mídia; o
            // agno omite o content None): não altera a mensagem
            if (isDelta && (isTeamMemberEvent || chunk.content == null)) return
            if (
              chunk.event === RunEvent.RunStarted ||
              chunk.event === RunEvent.TeamRunStarted ||
              chunk.event === RunEvent.ReasoningStarted ||
              chunk.event === RunEvent.TeamReasoningStarted
            ) {
              newSessionId = chunk.session_id as string
              setSessionId(chunk.session_id as string)
              // A conversa desta sessão já está na tela: o efeito de ChatArea
              // que reage ao ?session= não a recarrega do servidor.
              setLoadedSessionId(chunk.session_id as string)
              if (
                hasStorage &&
                (!sessionId || sessionId !== chunk.session_id) &&
                chunk.session_id
              ) {
                const sessionData = {
                  session_id: chunk.session_id as string,
                  title: messageText,
                  updated_at: chunk.created_at
                }
                setSessionsData((prevSessionsData) => {
                  const sessionExists = prevSessionsData?.some(
                    (session) => session.session_id === chunk.session_id
                  )
                  if (sessionExists) {
                    return prevSessionsData
                  }
                  return [sessionData, ...(prevSessionsData ?? [])]
                })
              }
            } else if (
              chunk.event === RunEvent.ToolCallStarted ||
              chunk.event === RunEvent.TeamToolCallStarted ||
              chunk.event === RunEvent.ToolCallCompleted ||
              chunk.event === RunEvent.TeamToolCallCompleted
            ) {
              setMessages((prevMessages) => {
                const newMessages = [...prevMessages]
                const lastMessage = newMessages[newMessages.length - 1]
                if (lastMessage && lastMessage.role === 'agent') {
                  lastMessage.tool_calls = processChunkToolCalls(
                    chunk,
                    lastMessage.tool_calls
                  )
                }
                return newMessages
              })
            } else if (
              chunk.event === RunEvent.RunResponse ||
              chunk.event === RunEvent.RunResponseContent ||
              chunk.event === RunEvent.TeamRunResponseContent ||
              isDelta
            ) {
              setMessages((prevMessages) => {
                const newMessages = [...prevMessages]
                const lastMessage = newMessages[newMessages.length - 1]
                if (
                  lastMessage &&
                  lastMessage.role === 'agent' &&
                  typeof chunk.content === 'string'
                ) {
                  if (isDelta) {
                    lastMessage.content += chunk.content
                  } else {
                    // Eventos legados trazem o conteúdo acumulado
                    const uniqueContent = chunk.content.replace(lastContent, '')
                    lastMessage.content += uniqueContent
                    lastContent = chunk.content
                  }

                  // Handle tool calls streaming
                  lastMessage.tool_calls = processChunkToolCalls(
                    chunk,
                    lastMessage.tool_calls
                  )
                  if (chunk.extra_data?.references) {
                    lastMessage.extra_data = {
                      ...lastMessage.extra_data,
                      references: chunk.extra_data.references
                    }
                  }

                  lastMessage.created_at =
                    chunk.created_at ?? lastMessage.created_at
                  if (chunk.images) {
                    lastMessage.images = chunk.images
                  }
                  if (chunk.videos) {
                    lastMessage.videos = chunk.videos
                  }
                  if (chunk.audio) {
                    lastMessage.audio = chunk.audio
                  }
                } else if (
                  lastMessage &&
                  lastMessage.role === 'agent' &&
                  typeof chunk?.content !== 'string' &&
                  chunk.content !== null
                ) {
                  const jsonBlock = getJsonMarkdown(chunk?.content)

                  lastMessage.content += jsonBlock
                  lastContent = jsonBlock
                } else if (
                  chunk.response_audio?.transcript &&
                  typeof chunk.response_audio?.transcript === 'string'
                ) {
                  const transcript = chunk.response_audio.transcript
                  lastMessage.response_audio = {
                    ...lastMessage.response_audio,
                    transcript:
                      lastMessage.response_audio?.transcript + transcript
                  }
                }
                return newMessages
              })
            } else if (
              chunk.event === RunEvent.ReasoningStep ||
              chunk.event === RunEvent.TeamReasoningStep
            ) {
              // O passo vem em `content` (agno 3). A tool think/analyze que o
              // gerou deixa de ser chip: o passo a representa no painel.
              const step = parseReasoningStep(chunk.content)
              if (step) {
                setMessages((prevMessages) =>
                  updateLastAgentMessage(prevMessages, (message) => ({
                    ...message,
                    tool_calls: dropReasoningToolCall(message.tool_calls ?? [], step),
                    extra_data: {
                      ...message.extra_data,
                      reasoning_steps: [...(message.extra_data?.reasoning_steps ?? []), step]
                    }
                  }))
                )
              }
            } else if (
              chunk.event === RunEvent.ReasoningCompleted ||
              chunk.event === RunEvent.TeamReasoningCompleted
            ) {
              // No team, a lista do membro (ReasoningCompleted sem o prefixo
              // Team) é de outro run: o ReasoningStep ao vivo já trouxe cada
              // passo, e juntar por título tomaria o lugar do passo de outro
              // membro.
              const steps =
                mode === 'team' && chunk.event === RunEvent.ReasoningCompleted
                  ? []
                  : parseCompletedSteps(chunk.content)
              if (steps.length > 0) {
                setMessages((prevMessages) =>
                  updateLastAgentMessage(prevMessages, (message) => ({
                    ...message,
                    extra_data: {
                      ...message.extra_data,
                      reasoning_steps: mergeReasoningSteps(
                        message.extra_data?.reasoning_steps ?? [],
                        steps
                      )
                    }
                  }))
                )
              }
            } else if (
              chunk.event === RunEvent.RunError ||
              chunk.event === RunEvent.TeamRunError ||
              chunk.event === RunEvent.TeamRunCancelled ||
              chunk.event === RunEvent.RunCancelled
            ) {
              finished = true
              // O texto do RunError só vem saneado no `error` do BFF (QA1-03).
              failRun(
                chunk.event === RunEvent.TeamRunCancelled ||
                  chunk.event === RunEvent.RunCancelled
                  ? { kind: 'cancelled' }
                  : (chunk.error ?? { kind: 'other' })
              )
            } else if (
              chunk.event === RunEvent.UpdatingMemory ||
              chunk.event === RunEvent.TeamMemoryUpdateStarted ||
              chunk.event === RunEvent.TeamMemoryUpdateCompleted
            ) {
              // No-op for now; could surface a lightweight UI indicator in the future
            } else if (
              chunk.event === RunEvent.RunCompleted ||
              chunk.event === RunEvent.TeamRunCompleted
            ) {
              if (!isTeamMemberEvent) finished = true
              setMessages((prevMessages) =>
                updateLastAgentMessage(prevMessages, (message) => {
                  let updatedContent: string
                  if (typeof chunk.content === 'string') {
                    updatedContent = chunk.content
                  } else {
                    try {
                      updatedContent = JSON.stringify(chunk.content)
                    } catch {
                      updatedContent = t('parseError')
                    }
                  }
                  return {
                    ...message,
                    // Membro de team não sobrescreve o texto, mas a mídia
                    // dele segue mesclada (decisão 0007)
                    content: isTeamMemberEvent ? message.content : updatedContent,
                    tool_calls: processChunkToolCalls(chunk, message.tool_calls),
                    // As métricas do membro não são as da resposta do team
                    // (D-P1-06-2, decisão 0015)
                    metrics: isTeamMemberEvent
                      ? message.metrics
                      : pickRunMetrics(chunk.metrics),
                    images: chunk.images ?? message.images,
                    videos: chunk.videos ?? message.videos,
                    response_audio: chunk.response_audio,
                    created_at: chunk.created_at ?? message.created_at,
                    extra_data: {
                      // A lista do membro não entra (ver ReasoningCompleted)
                      reasoning_steps: isTeamMemberEvent
                        ? message.extra_data?.reasoning_steps
                        : mergeReasoningSteps(
                            message.extra_data?.reasoning_steps ?? [],
                            parseReasoningSteps(chunk.reasoning_steps)
                          ),
                      references:
                        chunk.extra_data?.references ??
                        message.extra_data?.references
                    }
                  }
                })
              )
            }
          },
          onError: failRun,
          onComplete: () => {
            if (!finished) failRun({ kind: 'interrupted' })
          }
        })
      } catch (error) {
        // Falha inesperada no handler: sem tipo, a bolha mostra só a dica
        // genérica; a exceção fica no console (P1-04b).
        console.error('Error handling the chat stream:', error)
        failRun(null)
      } finally {
        // Só o run atual libera o composer (um run novo já pode ter começado).
        if (usePlaygroundStore.getState().runAbortController === controller) {
          setRunAbortController(null)
          focusChatInput()
          setIsStreaming(false)
        }
        // A lista é do servidor: no fim do run, ok ou com erro (o agno grava
        // a sessão antes do RunError), ela é relida com o horário novo. Run
        // abortado não relê: a conversa já é outra (troca, nova, saída).
        if (hasStorage && newSessionId && !controller.signal.aborted)
          getSessions({ entityType: mode, agentId, teamId }, { quiet: true })
      }
    },
    [
      setMessages,
      addMessage,
      updateMessagesWithErrorState,
      streamResponse,
      agentId,
      teamId,
      mode,
      setStreamingErrorMessage,
      setIsStreaming,
      setRunAbortController,
      focusChatInput,
      setSessionsData,
      setLoadedSessionId,
      getSessions,
      sessionId,
      setSessionId,
      hasStorage,
      processChunkToolCalls,
      t
    ]
  )

  return { handleStreamResponse }
}

export default useAIChatStreamHandler
