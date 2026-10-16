import type { Metadata } from 'next'

import { AgentEditor } from '@/components/management/agents/AgentEditor'

export const metadata: Metadata = { title: 'Novo agente' }

export default function NewAgentPage() {
  return <AgentEditor />
}
