import type { Metadata } from 'next'

import { AgentManagement } from '@/components/management/agents/AgentManagement'

export const metadata: Metadata = { title: 'Agentes' }

export default function AgentsPage() {
  return <AgentManagement />
}
