import { useQueryState } from 'nuqs'
import { useTranslations } from 'next-intl'
import { Bot, CircleAlert, Database, History, Unplug } from 'lucide-react'

import { Button } from '@/components/ui/button'
import useSessionLoader from '@/hooks/useSessionLoader'
import { usePlaygroundStore } from '@/store'
import { cn } from '@/lib/utils'

// Caixa de sessões vazia: um texto, na primeira condição verdadeira da ordem
// da spec (docs/design/P1-05.md, sem o "sem endpoint" desde a P2-03).
const SessionBlankState = () => {
  const {
    agents,
    teams,
    isOrchestratorActive,
    hasStorage,
    sessionsError,
    isSessionsLoading,
    mode
  } = usePlaygroundStore()
  const { getSessions } = useSessionLoader()
  const [agentId] = useQueryState('agent')
  const [teamId] = useQueryState('team')
  const t = useTranslations('playground')
  const tc = useTranslations('common')

  const box = (icon: React.ReactNode, content: React.ReactNode, isError = false) => (
    <div
      role={isError ? 'alert' : undefined}
      className="mt-1 flex flex-col items-center gap-2 rounded-lg bg-muted px-3 py-4 text-center text-sm text-muted-foreground"
    >
      <span aria-hidden="true" className={cn('[&_svg]:size-4', isError && 'text-destructive')}>
        {icon}
      </span>
      {content}
    </div>
  )
  const text = (content: React.ReactNode) => <p className="max-w-[210px]">{content}</p>

  if (!isOrchestratorActive) return box(<Unplug />, text(t('sessionsOrchestratorOff')))
  // Sem entidade na URL ou com uma que a lista não tem (?team= inexistente).
  const entityId = mode === 'team' ? teamId : agentId
  if (!(mode === 'team' ? teams : agents).some((entity) => entity.value === entityId))
    return box(
      <Bot />,
      text(mode === 'team' ? t('sessionsNoTeam') : t('sessionsNoAgent'))
    )
  if (sessionsError)
    return box(
      <CircleAlert />,
      <>
        {text(t('sessionsLoadError'))}
        <Button
          variant="link"
          className="h-auto p-0 aria-disabled:opacity-50"
          aria-disabled={isSessionsLoading || undefined}
          onClick={() => {
            if (!isSessionsLoading) getSessions({ entityType: mode, agentId, teamId })
          }}
        >
          {isSessionsLoading ? tc('retrying') : tc('retry')}
        </Button>
      </>,
      true
    )
  if (!hasStorage) {
    const link = (chunks: React.ReactNode) => (
      <a
        className="text-primary underline underline-offset-4"
        href="https://docs.agno.com/storage"
        target="_blank"
        rel="noopener noreferrer"
      >
        {chunks}
      </a>
    )
    return box(
      <Database />,
      text(
        mode === 'team'
          ? t.rich('sessionsNoStorageTeam', { link })
          : t.rich('sessionsNoStorage', { link })
      )
    )
  }
  return box(<History />, text(t('sessionsEmpty')))
}

export default SessionBlankState
