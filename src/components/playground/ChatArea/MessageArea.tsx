'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { StickToBottom } from 'use-stick-to-bottom'

import { useSelectedEntity } from '@/hooks/useSelectedEntity'
import { usePlaygroundStore } from '@/store'
import Messages from './Messages'
import ScrollToBottom from '@/components/playground/ChatArea/ScrollToBottom'

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

  return (
    <>
      <StickToBottom
        className="relative flex min-h-0 flex-grow flex-col"
        resize="smooth"
        initial="smooth"
      >
        <StickToBottom.Content className="flex min-h-full flex-col justify-center px-4 lg:px-6">
          <div
            role="log"
            aria-live="polite"
            aria-busy={isStreaming || undefined}
            className="mx-auto flex w-full max-w-3xl flex-col gap-5 py-5 text-base leading-6 lg:gap-6 lg:py-8"
          >
            <Messages messages={messages} entity={entity} />
          </div>
        </StickToBottom.Content>
        <ScrollToBottom />
      </StickToBottom>
      <StreamStatus key={entity?.id} name={entity?.name ?? ''} />
    </>
  )
}

export default MessageArea
