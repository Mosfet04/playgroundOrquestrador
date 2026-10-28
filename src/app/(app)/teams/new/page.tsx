import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { TeamEditor } from '@/components/management/teams/TeamEditor'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('nav')
  return { title: t('newTeam') }
}

export default function NewTeamPage() {
  return <TeamEditor />
}
