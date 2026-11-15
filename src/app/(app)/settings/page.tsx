import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { Settings } from '@/components/management/settings/Settings'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('nav')
  return { title: t('settings') }
}

export default function SettingsPage() {
  return <Settings />
}
