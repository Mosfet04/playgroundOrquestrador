'use client'
import { useId, useState } from 'react'
import { toast } from 'sonner'
import { Send } from 'lucide-react'
import { TextArea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/loading'
import { usePlaygroundStore } from '@/store'
import useAIChatStreamHandler from '@/hooks/useAIStreamHandler'
import { useSelectedEntity } from '@/hooks/useSelectedEntity'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'

// Composer (docs/design/P1-06.md, § 2): card com o foco no próprio card, chip
// "para {id}", dica de teclado e Enviar com o motivo no aria-label quando
// desabilitado.
const ChatInput = () => {
  const { chatInputRef } = usePlaygroundStore()

  const { handleStreamResponse } = useAIChatStreamHandler()
  const entity = useSelectedEntity()
  const [inputMessage, setInputMessage] = useState('')
  const isStreaming = usePlaygroundStore((state) => state.isStreaming)
  const isEndpointActive = usePlaygroundStore((state) => state.isEndpointActive)
  const isEndpointLoading = usePlaygroundStore((state) => state.isEndpointLoading)
  const t = useTranslations('playground')
  const inputId = useId()
  // O placeholder diz por que o composer está desabilitado (P1-05).
  const offline = !isEndpointActive && !isEndpointLoading
  const disabled = offline || isEndpointLoading || !entity
  const isEmpty = !inputMessage.trim()
  const placeholder = offline
    ? t('composerOffline')
    : entity
      ? t('composerPlaceholder', { name: entity.name })
      : t('composerNoEntity')
  const sendLabel =
    offline || isEndpointLoading
      ? t('sendOffline')
      : !entity
        ? t('sendNoEntity')
        : isStreaming
          ? t('sendWaitStream')
          : isEmpty
            ? t('sendEmpty')
            : t('sendLabel')

  const handleSubmit = async () => {
    if (isEmpty) return

    const currentMessage = inputMessage
    setInputMessage('')

    try {
      await handleStreamResponse(currentMessage)
    } catch (error) {
      console.error('Error sending the message:', error)
      toast.error(t('sendError'))
    }
  }

  return (
    <div
      className={cn(
        'mx-auto flex w-full max-w-3xl flex-col gap-2 rounded-lg border bg-card p-3 font-sans',
        disabled
          ? 'border-border'
          : 'border-input has-[textarea:focus]:border-primary has-[textarea:focus]:shadow-glow has-[textarea:focus]:ring-2 has-[textarea:focus]:ring-ring has-[textarea:focus]:ring-offset-2 has-[textarea:focus]:ring-offset-background'
      )}
    >
      {entity && (
        <label htmlFor={inputId} className="sr-only">
          {t('composerLabel', { name: entity.name })}
        </label>
      )}
      <TextArea
        id={inputId}
        placeholder={placeholder}
        value={inputMessage}
        onChange={(e) => setInputMessage(e.target.value)}
        onKeyDown={(e) => {
          if (
            e.key === 'Enter' &&
            !e.nativeEvent.isComposing &&
            !e.shiftKey &&
            !isStreaming
          ) {
            e.preventDefault()
            handleSubmit()
          }
        }}
        className="min-h-8 rounded-none border-0 px-1 py-0.5 text-base leading-6 text-foreground focus-visible:shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 md:!min-h-12 md:text-base"
        disabled={disabled}
        ref={chatInputRef}
      />
      <div className="flex min-w-0 items-center gap-2">
        {!disabled && entity && (
          <Chip className="min-w-0 overflow-hidden">
            {t.rich('composerTarget', {
              id: entity.id,
              muted: (chunks) => <span className="text-muted-foreground">{chunks}</span>
            })}
          </Chip>
        )}
        <span className="hidden font-mono text-xs text-muted-foreground md:inline">
          {t('composerHint')}
        </span>
        <Button
          onClick={handleSubmit}
          disabled={disabled || isEmpty || isStreaming}
          className="ml-auto size-11 shrink-0 md:size-auto md:h-9 md:px-4"
          aria-label={sendLabel}
        >
          <Send aria-hidden="true" />
          <span className="hidden md:inline">{t('send')}</span>
        </Button>
      </div>
    </div>
  )
}

export default ChatInput
