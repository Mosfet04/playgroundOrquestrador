'use client'

import ChatInput from './ChatInput'
import MessageArea from './MessageArea'
import { Button } from '@/components/ui/button'
import { Menu } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ChatAreaProps {
  isMobile?: boolean
  onToggleSidebar?: () => void
}

const ChatArea = ({ isMobile = false, onToggleSidebar }: ChatAreaProps) => {
  return (
    <main className={cn(
      "relative flex flex-grow flex-col rounded-xl bg-background",
      isMobile ? "m-0 w-full" : "m-1.5"
    )}>
      {/* Mobile header com botão do menu */}
      {isMobile && (
        <div className="sticky top-0 z-10 flex items-center justify-between p-4 bg-background border-b border-border">
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggleSidebar}
            className="md:hidden z-20"
          >
            <Menu className="w-4 h-4" />
            <span className="ml-1 text-xs">Sidebar</span>
          </Button>
          <h1 className="text-lg font-semibold">Chat</h1>
          <div className="w-16" /> {/* Spacer for alignment com mais espaço */}
        </div>
      )}
      
      <MessageArea isMobile={isMobile} />
      
      <div className={cn(
        "sticky bottom-0 px-4 pb-2",
        isMobile ? "ml-0" : "ml-9"
      )}>
        <ChatInput isMobile={isMobile} />
      </div>
    </main>
  )
}

export default ChatArea
