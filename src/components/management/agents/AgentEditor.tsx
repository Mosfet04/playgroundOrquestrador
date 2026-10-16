'use client'

import { useRouter } from 'next/navigation'

import { AgentConfig } from '@/types/management'
import { EntityLoader } from '../common/EntityLoader'
import { AgentForm } from './AgentForm'

const texts = {
  loading: 'Carregando agente...',
  notFound: 'Agente não encontrado',
  loadError: 'Não foi possível carregar o agente',
  back: 'Voltar para agentes',
  backHref: '/agents'
}

// /agents/new (sem id) e /agents/[id]: salvar com sucesso volta para a lista.
export function AgentEditor({ id }: { id?: string }) {
  const router = useRouter()
  const backToList = () => router.push('/agents')

  if (id === undefined) return <AgentForm onSuccess={backToList} />

  return (
    <EntityLoader<AgentConfig>
      url={`/api/agents/${encodeURIComponent(id)}`}
      id={id}
      texts={texts}
      getLabel={(agent) => agent.nome}
    >
      {(agent) => <AgentForm agent={agent} onSuccess={backToList} />}
    </EntityLoader>
  )
}
