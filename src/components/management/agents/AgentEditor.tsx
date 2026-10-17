'use client'

import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'

import { AgentConfig } from '@/types/management'
import { EntityLoader } from '../common/EntityLoader'
import { AgentForm } from './AgentForm'

// /agents/new (sem id) e /agents/[id]: salvar com sucesso volta para a lista.
export function AgentEditor({ id }: { id?: string }) {
  const router = useRouter()
  const t = useTranslations('agents')
  const backToList = () => router.push('/agents')

  if (id === undefined) return <AgentForm onSuccess={backToList} />

  return (
    <EntityLoader<AgentConfig>
      url={`/api/agents/${encodeURIComponent(id)}`}
      id={id}
      texts={{
        loading: t('loading'),
        notFound: t('notFound'),
        loadError: t('loadError'),
        back: t('backToList'),
        backHref: '/agents'
      }}
      getLabel={(agent) => agent.nome}
    >
      {(agent) => <AgentForm agent={agent} onSuccess={backToList} />}
    </EntityLoader>
  )
}
