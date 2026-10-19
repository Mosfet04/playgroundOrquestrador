import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { AgentEditor } from '@/components/management/agents/AgentEditor'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('nav')
  return { title: t('newAgent') }
}

export default function NewAgentPage() {
  return <AgentEditor />
}
