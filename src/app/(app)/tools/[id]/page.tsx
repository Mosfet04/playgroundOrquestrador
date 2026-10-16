import type { Metadata } from 'next'

import { decodeUrlSegment } from '@/lib/utils'
import { ToolEditor } from '@/components/management/tools/ToolEditor'

// O Next 15.2 entrega o segmento dinâmico codificado (`a%20b`).
type Props = { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const id = decodeUrlSegment((await params).id)
  return { title: `${id} · Tools` }
}

export default async function ToolPage({ params }: Props) {
  const id = decodeUrlSegment((await params).id)
  return <ToolEditor id={id} />
}
