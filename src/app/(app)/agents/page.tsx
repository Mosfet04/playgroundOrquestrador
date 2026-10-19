import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { AgentManagement } from '@/components/management/agents/AgentManagement'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('nav')
  return { title: t('agents') }
}

export default function AgentsPage() {
  return <AgentManagement />
}
