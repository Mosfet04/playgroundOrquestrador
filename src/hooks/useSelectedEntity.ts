import { useQueryState } from 'nuqs'

import { usePlaygroundStore } from '@/store'

export interface SelectedEntity {
  id: string
  /** Rótulo da lista; sem rótulo, o id. */
  name: string
  model: string
}

// Agente ou team da URL (?agent=/?team=), com nome e modelo da lista do store
// (docs/design/P1-06.md: bolha, composer, conversa vazia e subtítulo).
export function useSelectedEntity(): SelectedEntity | null {
  const [agentId] = useQueryState('agent')
  const [teamId] = useQueryState('team')
  const agents = usePlaygroundStore((state) => state.agents)
  const teams = usePlaygroundStore((state) => state.teams)
  const id = agentId ?? teamId
  if (!id) return null
  const entity = (agentId ? agents : teams).find((item) => item.value === id)
  return {
    id,
    name: entity?.label || id,
    model: entity?.model.model ?? ''
  }
}
