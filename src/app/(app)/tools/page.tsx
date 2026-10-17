import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { ToolManagement } from '@/components/management/tools/ToolManagement'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('nav')
  return { title: t('tools') }
}

export default function ToolsPage() {
  return <ToolManagement />
}
