'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { Plus } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { EmptyState, LiveStatus, LoadErrorState } from '@/components/ui/loading'
import useChatActions from '@/hooks/useChatActions'
import { useSelectedEntity } from '@/hooks/useSelectedEntity'
import { EntityAvatar } from '@/components/playground/EntityAvatar'
import { usePlaygroundStore } from '@/store'

// Conversa sem mensagens (docs/design/P1-05.md, /playground): conectando,
// orquestrador fora, sem entidades, nada selecionado ou a entidade escolhida.
const ChatBlankState = () => {
  const { isEndpointLoading, isEndpointActive, selectedEndpoint, agents, teams } =
    usePlaygroundStore()
  const { initializePlayground } = useChatActions()
  const entity = useSelectedEntity()
  const t = useTranslations('playground')
  const ta = useTranslations('agents')
  // "Conectando…" só fora do "Tentar de novo": na nova tentativa o bloco de
  // erro fica montado, com o botão em "Tentando…" (Fluxo 3 da spec).
  const [retrying, setRetrying] = useState(false)

  if (isEndpointLoading && !retrying)
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <LiveStatus>{t('connecting')}</LiveStatus>
      </div>
    )

  // Na nova tentativa o bloco fica até ela terminar: no meio dela o endpoint
  // já pode estar ativo sem os agentes carregados (falso "sem agentes").
  if (!isEndpointActive || retrying)
    return (
      <LoadErrorState
        title={t('offlineTitle')}
        detail={selectedEndpoint}
        onRetry={async () => {
          setRetrying(true)
          try {
            await initializePlayground()
          } finally {
            setRetrying(false)
          }
          return usePlaygroundStore.getState().isEndpointActive
        }}
        className="mx-auto w-full max-w-[640px]"
      />
    )

  if (agents.length === 0 && teams.length === 0)
    return (
      <EmptyState
        title={ta('emptyTitle')}
        description={t('noEntitiesDescription')}
        actions={
          <Button asChild>
            <Link href="/agents/new">
              <Plus aria-hidden="true" />
              {ta('createFirst')}
            </Link>
          </Button>
        }
        className="border-0 bg-transparent"
      />
    )

  const name = entity?.name

  return (
    <div className="dot-grid flex flex-1 flex-col items-center justify-center gap-3 px-6 py-8 text-center">
      {entity && (
        <EntityAvatar name={entity.name} id={entity.id} className="size-10 rounded-md text-sm" />
      )}
      <h2 className="text-lg font-semibold">
        {name ? t('chatEmptyTitle', { name }) : t('composerNoEntity')}
      </h2>
      {name && (
        <p className="max-w-[48ch] text-muted-foreground">{t('chatEmptyDescription')}</p>
      )}
    </div>
  )
}

export default ChatBlankState
