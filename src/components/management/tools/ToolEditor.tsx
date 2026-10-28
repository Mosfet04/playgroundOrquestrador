'use client'

import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Wrench } from 'lucide-react'

import { Tool } from '@/types/management'
import { EntityLoader } from '../common/EntityLoader'
import { ToolForm } from './ToolForm'

// /tools/new (sem id) e /tools/[id]: salvar ou excluir com sucesso volta
// para a lista.
export function ToolEditor({ id }: { id?: string }) {
  const router = useRouter()
  const t = useTranslations('tools')
  const backToList = () => router.push('/tools')

  if (id === undefined) return <ToolForm onSuccess={backToList} />

  return (
    <EntityLoader<Tool>
      url={`/api/tools/${encodeURIComponent(id)}`}
      id={id}
      texts={{
        loading: t('loading'),
        notFound: t('notFound'),
        loadError: t('loadError'),
        back: t('backToList'),
        backHref: '/tools'
      }}
      icon={Wrench}
      getLabel={(tool) => tool.name}
    >
      {(tool, controls) => <ToolForm tool={tool} controls={controls} onSuccess={backToList} />}
    </EntityLoader>
  )
}
