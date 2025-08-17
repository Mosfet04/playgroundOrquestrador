'use client'

import { usePlaygroundStore } from '@/store'
import Messages from './Messages'
import ScrollToBottom from '@/components/playground/ChatArea/ScrollToBottom'
import { StickToBottom } from 'use-stick-to-bottom'
import { cn } from '@/lib/utils'

interface MessageAreaProps {
  isMobile?: boolean
}

const MessageArea = ({ isMobile = false }: MessageAreaProps) => {
  const { messages } = usePlaygroundStore()

  return (
    <StickToBottom
      className={cn(
        "relative mb-4 flex min-h-0 flex-grow flex-col",
        isMobile 
          ? "max-h-[calc(100vh-140px)]" // Ajuste para mobile considerando header
          : "max-h-[calc(100vh-64px)]"
      )}
      resize="smooth"
      initial="smooth"
    >
      <StickToBottom.Content className="flex min-h-full flex-col justify-center">
        <div className={cn(
          "mx-auto w-full space-y-9 pb-4",
          isMobile 
            ? "max-w-full px-2" // Full width em mobile com padding menor
            : "max-w-2xl px-4"
        )}>
          <Messages messages={messages} isMobile={isMobile} />
        </div>
      </StickToBottom.Content>
      <ScrollToBottom />
    </StickToBottom>
  )
}

export default MessageArea
