'use client'
import { Button } from '@/components/ui/button'
import { ModeSelector } from '@/components/playground/Sidebar/ModeSelector'
import { EntitySelector } from '@/components/playground/Sidebar/EntitySelector'
import useChatActions from '@/hooks/useChatActions'
import { DEFAULT_ENDPOINT, usePlaygroundStore } from '@/store'
import { useState, useEffect, useId, type ReactNode } from 'react'
import Icon from '@/components/ui/icon'
import Sessions from './Sessions'
import { isValidUrl, cn, focusRing } from '@/lib/utils'
import { toast } from 'sonner'
import { useQueryState } from 'nuqs'
import { useTranslations } from 'next-intl'
import { PanelLeftClose, PanelLeftOpen, Plus, RefreshCw } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { panelLabelClass } from './panelLabel'

const Endpoint = () => {
  const {
    selectedEndpoint,
    isEndpointActive,
    isEndpointLoading,
    setSelectedEndpoint,
    setAgents,
    setSessionsData,
    setMessages
  } = usePlaygroundStore()
  const { initializePlayground } = useChatActions()
  const [isEditing, setIsEditing] = useState(false)
  const [endpointValue, setEndpointValue] = useState('')
  const [isMounted, setIsMounted] = useState(false)
  const [isRotating, setIsRotating] = useState(false)
  const [, setAgentId] = useQueryState('agent')
  const [, setSessionId] = useQueryState('session')
  const t = useTranslations('playground')
  const tc = useTranslations('common')
  // Ponto: `signal` pulsando enquanto conecta (não passa por `destructive`
  // antes do fim da tentativa), `success` online, `destructive` offline; a
  // palavra vai para o leitor de tela (V-P1-06-10).
  const [statusWord, dotClass] = isEndpointLoading
    ? [t('endpointConnecting'), 'live-dot bg-current text-signal']
    : isEndpointActive
      ? [tc('online'), 'bg-success']
      : [tc('offline'), 'bg-destructive']
  // A URL descreve o botão "Editar endpoint" (há 2 Sidebars abaixo de lg).
  const endpointUrlId = useId()

  useEffect(() => {
    setEndpointValue(selectedEndpoint)
    setIsMounted(true)
  }, [selectedEndpoint])

  const handleSave = async () => {
    if (!isValidUrl(endpointValue)) {
      toast.error(t('invalidUrl'))
      return
    }
    const cleanEndpoint = endpointValue.replace(/\/$/, '').trim()
    setSelectedEndpoint(cleanEndpoint)
    setAgentId(null)
    setSessionId(null)
    setIsEditing(false)
    setAgents([])
    setSessionsData([])
    setMessages([])
  }

  const handleCancel = () => {
    setEndpointValue(selectedEndpoint)
    setIsEditing(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSave()
    } else if (e.key === 'Escape') {
      handleCancel()
    }
  }

  const handleRefresh = async () => {
    setIsRotating(true)
    await initializePlayground()
    setTimeout(() => setIsRotating(false), 500)
  }

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-4">
      <p className={panelLabelClass}>{t('endpoint')}</p>
      {isEditing ? (
        <div className="flex w-full items-center gap-1">
          <input
            type="text"
            value={endpointValue}
            onChange={(e) => setEndpointValue(e.target.value)}
            onKeyDown={handleKeyDown}
            aria-label={t('endpoint')}
            className={cn(
              'flex h-11 w-full min-w-0 items-center rounded-md border border-input bg-muted px-3 font-mono text-base text-foreground md:text-xs lg:h-9',
              focusRing
            )}
            autoFocus
          />
          <Button
            variant="ghost"
            size="icon"
            onClick={handleSave}
            className="size-11 shrink-0 lg:size-9"
            aria-label={t('saveEndpoint')}
          >
            <Icon type="save" size="xs" />
          </Button>
        </div>
      ) : (
        <div className="flex w-full items-center gap-1">
          <button
            type="button"
            aria-label={t('editEndpoint')}
            aria-describedby={endpointUrlId}
            title={t('editEndpoint')}
            onClick={() => setIsEditing(true)}
            className={cn(
              'flex h-11 min-w-0 flex-1 items-center gap-2 rounded-md border border-border bg-muted px-3 text-left font-mono text-xs text-muted-foreground lg:h-9',
              focusRing
            )}
          >
            <span id={endpointUrlId} className="min-w-0 flex-1 truncate">
              {isMounted ? selectedEndpoint || t('noEndpoint') : DEFAULT_ENDPOINT}{' '}
              <span className="sr-only">{statusWord}</span>
            </span>
            <span aria-hidden="true" className={cn('size-2 shrink-0 rounded-full', dotClass)} />
          </button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleRefresh}
            className="size-11 shrink-0 lg:size-9"
            aria-label={t('refresh')}
          >
            <RefreshCw
              aria-hidden="true"
              className={cn(isRotating && 'motion-safe:animate-spin')}
            />
          </Button>
        </div>
      )}
    </div>
  )
}

// Painel de sessões e agente (docs/design/P1-06.md, § 2). No desktop fica na
// página do playground, com o botão de recolher; abaixo de lg abre no Sheet do
// cabeçalho (AppHeader), que passa o "Fechar" em `closeAction`. Só renderiza:
// a carga (status, agentes, sessões) é do ChatArea.
const Sidebar = ({ closeAction }: { closeAction?: ReactNode }) => {
  const [isCollapsed, setIsCollapsed] = useState(false)
  const { clearChat, focusChatInput } = useChatActions()
  const { messages, isEndpointActive, isEndpointLoading } = usePlaygroundStore()
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
        <div className="flex flex-col gap-3">
          {/* Agente | Team e o cartão só com o orquestrador online (P1-05). */}
          {isMounted &&
            (isEndpointLoading ? (
              <>
                <Skeleton className="h-10 w-full rounded-md lg:h-9" />
                <Skeleton className="h-14 w-full rounded-lg" />
              </>
            ) : (
              isEndpointActive && (
                <>
                  <ModeSelector labelledBy={labelId} />
                  <EntitySelector />
                </>
              )
            ))}
          <Button
            variant="outline"
            onClick={handleNewChat}
            disabled={messages.length === 0}
            className="h-10 w-full lg:h-9"
          >
            <Plus aria-hidden="true" />
            {t('newChat')}
          </Button>
        </div>
        {isMounted && (
          <>
            <Sessions />
            <Endpoint />
          </>
        )}
      </div>
    </aside>
  )
}

export default Sidebar
