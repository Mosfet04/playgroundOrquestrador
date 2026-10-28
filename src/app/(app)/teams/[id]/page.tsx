import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { decodeUrlSegment } from '@/lib/utils'
import { TeamEditor } from '@/components/management/teams/TeamEditor'

// O Next 15.2 entrega o segmento dinâmico codificado (`a%20b`).
type Props = { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const id = decodeUrlSegment((await params).id)
  const t = await getTranslations('nav')
  return { title: `${id} · ${t('teams')}` }
}

export default async function TeamPage({ params }: Props) {
  const id = decodeUrlSegment((await params).id)
  return <TeamEditor id={id} />
}
