'use client'
import { Button } from '@/components/ui/button'
import { ModeSelector } from '@/components/playground/Sidebar/ModeSelector'
import { EntitySelector } from '@/components/playground/Sidebar/EntitySelector'
import useChatActions from '@/hooks/useChatActions'
import { usePlaygroundStore } from '@/store'
import { useState, useEffect, useId, type ReactNode } from 'react'
import Sessions from './Sessions'
import { cn } from '@/lib/utils'
import { useTranslations } from 'next-intl'
import { PanelLeftClose, PanelLeftOpen, Plus } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { panelLabelClass } from './panelLabel'

// Painel de sessões e agente (docs/design/P1-06.md, § 2). No desktop fica na
// página do playground, com o botão de recolher; abaixo de lg abre no Sheet do
// cabeçalho (AppHeader), que passa o "Fechar" em `closeAction`. Só renderiza:
// a carga (status, agentes, sessões) é do ChatArea.
const Sidebar = ({ closeAction }: { closeAction?: ReactNode }) => {
  const [isCollapsed, setIsCollapsed] = useState(false)
  const { clearChat, focusChatInput } = useChatActions()
  const { messages, isOrchestratorActive, isOrchestratorLoading } = usePlaygroundStore()
  const [isMounted, setIsMounted] = useState(false)
  const t = useTranslations('playground')
  const labelId = useId()

  // A carga do playground fica no ChatArea (montado uma vez): abaixo de lg
  // há uma 2ª Sidebar no Sheet, que só renderiza.
  useEffect(() => setIsMounted(true), [])

  const handleNewChat = () => {
    clearChat()
    focusChatInput()
  }

  // Recolhido: trilho de 48 px só com "Expandir". O conteúdo fica montado com
  // `hidden` (fora do Tab e do leitor de tela): remontar o cartão o faria
  // focar o composer, e o botão é o mesmo, então o foco fica nele.
  return (
    <aside
      className={cn(
        'flex h-full min-h-0 flex-col gap-3',
        closeAction
          ? 'w-full p-4'
          : 'shrink-0 border-r border-border bg-card',
        !closeAction && (isCollapsed ? 'w-12 items-center py-4' : 'w-72 p-4')
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p id={labelId} hidden={isCollapsed} className={panelLabelClass}>
          {t('chatWith')}
        </p>
        {closeAction ?? (
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label={isCollapsed ? t('expandPanel') : t('collapsePanel')}
            aria-expanded={!isCollapsed}
            onClick={() => setIsCollapsed((collapsed) => !collapsed)}
          >
            {isCollapsed ? (
              <PanelLeftOpen aria-hidden="true" />
            ) : (
              <PanelLeftClose aria-hidden="true" />
            )}
          </Button>
        )}
      </div>
      <div
        hidden={isCollapsed}
        className={isCollapsed ? undefined : 'flex min-h-0 flex-1 flex-col gap-6'}
      >
        {/* Agente | Team, cartão e "Nova conversa" só com o orquestrador
            online (P1-05); offline, só "Conversar com" + recolher (V-P2-03-2). */}
        {isMounted && (isOrchestratorLoading || isOrchestratorActive) && (
          <div className="flex flex-col gap-3">
            {isOrchestratorLoading ? (
              <>
                <Skeleton className="h-10 w-full rounded-md lg:h-9" />
                <Skeleton className="h-14 w-full rounded-lg" />
              </>
            ) : (
              <>
                <ModeSelector labelledBy={labelId} />
                <EntitySelector />
                <Button
                  variant="outline"
                  onClick={handleNewChat}
                  disabled={messages.length === 0}
                  className="h-10 w-full lg:h-9"
                >
                  <Plus aria-hidden="true" />
                  {t('newChat')}
                </Button>
              </>
            )}
          </div>
        )}
        {/* Sem bloco Endpoint: a URL do orquestrador é do servidor (P2-03). */}
        {isMounted && <Sessions />}
      </div>
    </aside>
  )
}

export default Sidebar
