import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { Dashboard } from '@/components/management/dashboard/Dashboard'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('nav')
  return { title: t('dashboard') }
}

export default function DashboardPage() {
  return <Dashboard />
}
