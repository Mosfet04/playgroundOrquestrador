import { useCallback } from 'react'
import { useTranslations } from 'next-intl'

import { APIRoutes } from '@/api/routes'

import useChatActions from '@/hooks/useChatActions'
import { usePlaygroundStore } from '../store'
import {
  RunEvent,
  RunResponseContent,
  type RunMetrics,
  type RunResponse
} from '@/types/playground'
import { constructEndpointUrl } from '@/lib/constructEndpointUrl'
import useAIResponseStream from './useAIResponseStream'
import { ToolCall } from '@/types/playground'
import { useQueryState } from 'nuqs'
import { getJsonMarkdown } from '@/lib/utils'

// Só os números da resposta (tempo e tokens); o resto do RunMetrics fica de
// fora. Sem nenhum deles, a mensagem fica sem métricas.
const pickRunMetrics = (metrics?: RunMetrics): RunMetrics | undefined => {
  const picked: RunMetrics = {}
  for (const key of ['duration', 'input_tokens', 'output_tokens'] as const) {
    if (typeof metrics?.[key] === 'number') picked[key] = metrics[key]
  }
  return Object.keys(picked).length > 0 ? picked : undefined
}

const useAIChatStreamHandler = () => {
  const setMessages = usePlaygroundStore((state) => state.setMessages)
  const { addMessage, focusChatInput } = useChatActions()
  const [agentId] = useQueryState('agent')
  const [teamId] = useQueryState('team')
  const [sessionId, setSessionId] = useQueryState('session')
  const selectedEndpoint = usePlaygroundStore((state) => state.selectedEndpoint)
  const mode = usePlaygroundStore((state) => state.mode)
  const setStreamingErrorMessage = usePlaygroundStore(
    (state) => state.setStreamingErrorMessage
  )
  const setIsStreaming = usePlaygroundStore((state) => state.setIsStreaming)
  const setSessionsData = usePlaygroundStore((state) => state.setSessionsData)
  const hasStorage = usePlaygroundStore((state) => state.hasStorage)
  const { streamResponse } = useAIResponseStream()
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
 * Generates a stable client ID by combining browser fingerprint and IP address, then hashing the result.
 * Falls back to fingerprint-only if IP fetch fails.
 * @returns Promise<string> - The stable client ID hash
 */
const getStableClientId = async (): Promise<string> => {
  const FingerprintJS = await import('@fingerprintjs/fingerprintjs');
  const CryptoJS = await import('crypto-js');

  const fp = await FingerprintJS.load();
  const { visitorId } = await fp.get();

  let ip = 'unknown';
  try {
    const ipRes = await fetch('https://api.ipify.org?format=json', { signal: AbortSignal.timeout(3000) });
    const data = await ipRes.json();
    ip = data.ip;
  } catch {
    // Fallback to fingerprint only if IP fetch fails
  }

  const raw = `${visitorId}-${ip}`;
  const hash = CryptoJS.SHA256(raw).toString();
  return hash;
}

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

  const handleStreamResponse = useCallback(
    async (input: string | FormData) => {
      setIsStreaming(true)

      const messageText = typeof input === 'string'
        ? input
        : (input.get('message') as string) || ''

      setMessages((prevMessages) => {
        if (prevMessages.length >= 2) {
          const lastMessage = prevMessages[prevMessages.length - 1]
          const secondLastMessage = prevMessages[prevMessages.length - 2]
          if (
            lastMessage.role === 'agent' &&
            lastMessage.streamingError &&
            secondLastMessage.role === 'user'
          ) {
            return prevMessages.slice(0, -2)
          }
        }
        return prevMessages
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
      try {
        const endpointUrl = constructEndpointUrl(selectedEndpoint)

        let playgroundRunUrl: string | null = null

        if (mode === 'team' && teamId) {
          playgroundRunUrl = APIRoutes.TeamRun(endpointUrl, teamId)
        } else if (mode === 'agent' && agentId) {
          playgroundRunUrl = APIRoutes.AgentRun(endpointUrl, agentId)
        }

        if (!playgroundRunUrl) {
          updateMessagesWithErrorState()
          setStreamingErrorMessage({ kind: 'noEntity' })
          setIsStreaming(false)
          return
        }

        const userId = await getStableClientId()

        // Backend expects multipart/form-data for all requests
        const formData = input instanceof FormData ? input : new FormData()
        if (!(input instanceof FormData)) {
          formData.append('message', input)
        }
        formData.append('stream', 'true')
        if (sessionId) {
          formData.append('session_id', sessionId)
        }
        formData.append('user_id', userId)
        // Teams require monitor flag
        if (mode === 'team') {
          formData.append('monitor', 'true')
        }
        const requestBody = formData

        await streamResponse({
          apiUrl: playgroundRunUrl,
          requestBody,
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
              if (
                hasStorage &&
                (!sessionId || sessionId !== chunk.session_id) &&
                chunk.session_id
              ) {
                const sessionData = {
                  session_id: chunk.session_id as string,
                  title: messageText,
                  created_at: chunk.created_at
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
                  if (chunk.extra_data?.reasoning_steps) {
                    lastMessage.extra_data = {
                      ...lastMessage.extra_data,
                      reasoning_steps: chunk.extra_data.reasoning_steps
                    }
                  }

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
              setMessages((prevMessages) => {
                const newMessages = [...prevMessages]
                const lastMessage = newMessages[newMessages.length - 1]
                if (lastMessage && lastMessage.role === 'agent') {
                  const existingSteps =
                    lastMessage.extra_data?.reasoning_steps ?? []
                  const incomingSteps = chunk.extra_data?.reasoning_steps ?? []
                  lastMessage.extra_data = {
                    ...lastMessage.extra_data,
                    reasoning_steps: [...existingSteps, ...incomingSteps]
                  }
                }
                return newMessages
              })
            } else if (
              chunk.event === RunEvent.ReasoningCompleted ||
              chunk.event === RunEvent.TeamReasoningCompleted
            ) {
              setMessages((prevMessages) => {
                const newMessages = [...prevMessages]
                const lastMessage = newMessages[newMessages.length - 1]
                if (lastMessage && lastMessage.role === 'agent') {
                  if (chunk.extra_data?.reasoning_steps) {
                    lastMessage.extra_data = {
                      ...lastMessage.extra_data,
                      reasoning_steps: chunk.extra_data.reasoning_steps
                    }
                  }
                }
                return newMessages
              })
            } else if (
              chunk.event === RunEvent.RunError ||
              chunk.event === RunEvent.TeamRunError ||
              chunk.event === RunEvent.TeamRunCancelled
            ) {
              updateMessagesWithErrorState()
              setStreamingErrorMessage({
                kind:
                  chunk.event === RunEvent.TeamRunCancelled
                    ? 'cancelled'
                    : 'runError',
                detail:
                  typeof chunk.content === 'string' && chunk.content
                    ? chunk.content
                    : undefined
              })
              if (hasStorage && newSessionId) {
                setSessionsData(
                  (prevSessionsData) =>
                    prevSessionsData?.filter(
                      (session) => session.session_id !== newSessionId
                    ) ?? null
                )
              }
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
              setMessages((prevMessages) => {
                const newMessages = prevMessages.map((message, index) => {
                  if (
                    index === prevMessages.length - 1 &&
                    message.role === 'agent'
                  ) {
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
                      content: isTeamMemberEvent
                        ? message.content
                        : updatedContent,
                      tool_calls: processChunkToolCalls(
                        chunk,
                        message.tool_calls
                      ),
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
                        reasoning_steps:
                          chunk.extra_data?.reasoning_steps ??
                          message.extra_data?.reasoning_steps,
                        references:
                          chunk.extra_data?.references ??
                          message.extra_data?.references
                      }
                    }
                  }
                  return message
                })
                return newMessages
              })
            }
          },
          onError: (error) => {
            updateMessagesWithErrorState()
            setStreamingErrorMessage(error)
            if (hasStorage && newSessionId) {
              setSessionsData(
                (prevSessionsData) =>
                  prevSessionsData?.filter(
                    (session) => session.session_id !== newSessionId
                  ) ?? null
              )
            }
          },
          onComplete: () => {}
        })
      } catch (error) {
        // Falha antes do stream (montar a URL ou o user_id): sem tipo, a bolha
        // mostra só a dica genérica; a exceção fica no console (P1-04b).
        console.error('Error starting the chat stream:', error)
        updateMessagesWithErrorState()
        setStreamingErrorMessage(null)
        if (hasStorage && newSessionId) {
          setSessionsData(
            (prevSessionsData) =>
              prevSessionsData?.filter(
                (session) => session.session_id !== newSessionId
              ) ?? null
          )
        }
      } finally {
        focusChatInput()
        setIsStreaming(false)
      }
    },
    [
      setMessages,
      addMessage,
      updateMessagesWithErrorState,
      selectedEndpoint,
      streamResponse,
      agentId,
      teamId,
      mode,
      setStreamingErrorMessage,
      setIsStreaming,
      focusChatInput,
      setSessionsData,
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
