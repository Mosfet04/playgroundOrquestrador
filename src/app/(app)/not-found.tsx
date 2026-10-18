import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { NotFoundState } from '@/components/layout/NotFoundState'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('notFound')
  return { title: t('title') }
}

export default function NotFound() {
  return <NotFoundState />
}
