'use client'

import { useRouter } from 'next/navigation'

import { Tool } from '@/types/management'
import { EntityLoader } from '../common/EntityLoader'
import { ToolForm } from './ToolForm'

const texts = {
  loading: 'Carregando tool...',
  notFound: 'Tool não encontrada',
  loadError: 'Não foi possível carregar a tool',
  back: 'Voltar para tools',
  backHref: '/tools'
}

// /tools/new (sem id) e /tools/[id]: salvar com sucesso volta para a lista.
export function ToolEditor({ id }: { id?: string }) {
  const router = useRouter()
  const backToList = () => router.push('/tools')

  if (id === undefined) return <ToolForm onSuccess={backToList} />

  return (
    <EntityLoader<Tool>
      url={`/api/tools/${encodeURIComponent(id)}`}
      id={id}
      texts={texts}
      getLabel={(tool) => tool.name}
    >
      {(tool) => <ToolForm tool={tool} onSuccess={backToList} />}
    </EntityLoader>
  )
}
