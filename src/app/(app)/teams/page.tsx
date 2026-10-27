import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { TeamManagement } from '@/components/management/teams/TeamManagement'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('nav')
  return { title: t('teams') }
}

export default function TeamsPage() {
  return <TeamManagement />
}
