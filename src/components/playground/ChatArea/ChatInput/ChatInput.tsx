'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { TextArea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { usePlaygroundStore } from '@/store'
import useAIChatStreamHandler from '@/hooks/useAIStreamHandler'
import { useQueryState } from 'nuqs'
import { useTranslations } from 'next-intl'
import Icon from '@/components/ui/icon'

const ChatInput = () => {
  const { chatInputRef } = usePlaygroundStore()

  const { handleStreamResponse } = useAIChatStreamHandler()
  const [selectedAgent] = useQueryState('agent')
  const [teamId] = useQueryState('team')
  const [inputMessage, setInputMessage] = useState('')
  const isStreaming = usePlaygroundStore((state) => state.isStreaming)
  const isEndpointActive = usePlaygroundStore((state) => state.isEndpointActive)
  const isEndpointLoading = usePlaygroundStore((state) => state.isEndpointLoading)
  const t = useTranslations('playground')
  // O placeholder diz por que o composer está desabilitado (P1-05).
  const offline = !isEndpointActive && !isEndpointLoading
  const hasEntity = !!(selectedAgent || teamId)
  const disabled = offline || isEndpointLoading || !hasEntity
  const placeholder = offline
    ? t('composerOffline')
    : hasEntity
      ? t('composerPlaceholder')
      : t('composerNoEntity')
  const handleSubmit = async () => {
    if (!inputMessage.trim()) return

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
    <div className="relative mx-auto mb-1 flex w-full max-w-full items-end justify-center gap-x-2 px-2 font-sans lg:max-w-2xl lg:px-0">
      <TextArea
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
        className="w-full rounded-lg bg-card px-3 text-foreground lg:px-4"
        disabled={disabled}
        ref={chatInputRef}
      />
      <Button
        onClick={handleSubmit}
        disabled={disabled || !inputMessage.trim() || isStreaming}
        className="lg:w-9 lg:p-5"
        aria-label={t('send')}
      >
        <Icon type="send" className="text-primary-foreground" />
        <span className="ml-2 text-xs lg:hidden">{t('send')}</span>
      </Button>
    </div>
  )
}

export default ChatInput
