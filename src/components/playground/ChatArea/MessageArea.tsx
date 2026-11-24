'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { StickToBottom } from 'use-stick-to-bottom'

import useAIChatStreamHandler from '@/hooks/useAIStreamHandler'
import { useSelectedEntity } from '@/hooks/useSelectedEntity'
import { usePlaygroundStore } from '@/store'
import type { PlaygroundChatMessage } from '@/types/playground'
import Messages from './Messages'
import ScrollToBottom from '@/components/playground/ChatArea/ScrollToBottom'
import { cn } from '@/lib/utils'

// Fora do log: o leitor de tela ouve o início e o fim da resposta, uma vez
// cada, não token a token (docs/design/P1-06.md, § 6). No erro do stream, "falhou"
// (P2-03); a `key` da entidade zera o anúncio ao trocar de agente.
const StreamStatus = ({ name }: { name: string }) => {
  const isStreaming = usePlaygroundStore((state) => state.isStreaming)
  const failed = usePlaygroundStore(
    (state) => state.messages[state.messages.length - 1]?.streamingError
  )
  const t = useTranslations('playground')
  const [phase, setPhase] = useState<'idle' | 'responding' | 'done'>('idle')

  useEffect(() => {
    setPhase((prev) =>
      isStreaming ? 'responding' : prev === 'responding' ? 'done' : prev
    )
  }, [isStreaming])

  return (
    <p role="status" className="sr-only">
      {phase === 'responding' && t('respondingStatus', { name })}
      {phase === 'done' &&
        (failed ? t('responseFailed', { name }) : t('responseDone', { name }))}
    </p>
  )
}

const MessageArea = () => {
  const { messages } = usePlaygroundStore()
  const isStreaming = usePlaygroundStore((state) => state.isStreaming)
  const entity = useSelectedEntity()
  const { handleStreamResponse } = useAIChatStreamHandler()
  const t = useTranslations('playground')

  // Reenviar (QA1-03): a mesma mensagem na sessão da URL. Com um run em
  // andamento não faz nada, inclusive o 2º clique de um clique duplo (o 1º já
  // ligou o isStreaming). O botão some com a bolha: o foco vai ao composer.
  const resend = useCallback(
    (question: PlaygroundChatMessage) => {
      const { isStreaming, chatInputRef } = usePlaygroundStore.getState()
      if (isStreaming) return
      chatInputRef.current?.focus()
      handleStreamResponse(question.content, question).catch((error) => {
        console.error('Error resending the message:', error)
        toast.error(t('sendError'))
      })
    },
    [handleStreamResponse, t]
  )

  return (
    <>
      <StickToBottom
        className="relative flex min-h-0 flex-grow flex-col"
        resize="smooth"
        initial="smooth"
      >
        {/* Poucas mensagens ficam embaixo, junto do composer, com o vazio no
            topo (D-QA1-02-2); a conversa vazia fica no centro. */}
        <StickToBottom.Content
          className={cn(
            'flex min-h-full flex-col px-4 lg:px-6',
            messages.length > 0 ? 'justify-end' : 'justify-center'
          )}
        >
          <div
            role="log"
            aria-live="polite"
            aria-busy={isStreaming || undefined}
            className="mx-auto flex w-full max-w-3xl flex-col gap-5 py-5 text-base leading-6 lg:gap-6 lg:py-8"
          >
            <Messages messages={messages} entity={entity} onResend={resend} />
          </div>
        </StickToBottom.Content>
        <ScrollToBottom />
      </StickToBottom>
      <StreamStatus key={entity?.id} name={entity?.name ?? ''} />
    </>
  )
}

export default MessageArea
