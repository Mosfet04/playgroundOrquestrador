import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { GettingStarted } from '@/components/management/GettingStarted'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('nav')
  return { title: t('home') }
}

export default function HomePage() {
  return <GettingStarted />
}
