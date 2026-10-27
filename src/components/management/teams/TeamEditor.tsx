'use client'

import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Users } from 'lucide-react'

import type { TeamConfig } from '@/types/management'
import { EntityLoader } from '../common/EntityLoader'
import { TeamForm } from './TeamForm'

// /teams/new (sem id) e /teams/[id]: salvar ou excluir com sucesso volta para a lista.
export function TeamEditor({ id }: { id?: string }) {
  const router = useRouter()
  const t = useTranslations('teams')
  const backToList = () => router.push('/teams')

  if (id === undefined) return <TeamForm onSuccess={backToList} />

  return (
    <EntityLoader<TeamConfig>
      url={`/api/teams/${encodeURIComponent(id)}`}
      id={id}
      texts={{
        loading: t('loading'),
        notFound: t('notFound'),
        loadError: t('loadError'),
        back: t('backToList'),
        backHref: '/teams'
      }}
      icon={Users}
      getLabel={(team) => team.nome}
    >
      {(team) => <TeamForm team={team} onSuccess={backToList} />}
    </EntityLoader>
  )
}
