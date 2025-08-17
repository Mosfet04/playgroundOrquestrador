'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { TextArea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { usePlaygroundStore } from '@/store'
import useAIChatStreamHandler from '@/hooks/useAIStreamHandler'
import { useQueryState } from 'nuqs'
import Icon from '@/components/ui/icon'
import { cn } from '@/lib/utils'

interface ChatInputProps {
  isMobile?: boolean
}

const ChatInput = ({ isMobile = false }: ChatInputProps) => {
  const { chatInputRef } = usePlaygroundStore()

  const { handleStreamResponse } = useAIChatStreamHandler()
  const [selectedAgent] = useQueryState('agent')
  const [teamId] = useQueryState('team')
  const [inputMessage, setInputMessage] = useState('')
  const isStreaming = usePlaygroundStore((state) => state.isStreaming)
  const handleSubmit = async () => {
    if (!inputMessage.trim()) return

    const currentMessage = inputMessage
    setInputMessage('')

    try {
      await handleStreamResponse(currentMessage)
    } catch (error) {
      toast.error(
        `Error in handleSubmit: ${
          error instanceof Error ? error.message : String(error)
        }`
      )
    }
  }

  return (
    <div className={cn(
      "relative mx-auto mb-1 flex w-full items-end justify-center gap-x-2 font-geist",
      isMobile ? "max-w-full px-2" : "max-w-2xl"
    )}>
      <TextArea
        placeholder={'Ask anything'}
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
        className={cn(
          "w-full border border-accent bg-primaryAccent text-sm text-primary focus:border-accent",
          isMobile ? "px-3" : "px-4"
        )}
        disabled={!(selectedAgent || teamId)}
        ref={chatInputRef}
      />
      <Button
        onClick={handleSubmit}
        disabled={
          !(selectedAgent || teamId) || !inputMessage.trim() || isStreaming
        }
        size={isMobile ? "default" : "icon"}
        className={cn(
          "rounded-xl bg-primary text-primaryAccent",
          isMobile ? "px-4 py-2" : "p-5"
        )}
      >
        <Icon type="send" color="primaryAccent" />
        {isMobile && <span className="ml-2 text-xs">Enviar</span>}
      </Button>
    </div>
  )
}

export default ChatInput
