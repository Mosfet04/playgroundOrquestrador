import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { ToolEditor } from '@/components/management/tools/ToolEditor'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('nav')
  return { title: t('newTool') }
}

export default function NewToolPage() {
  return <ToolEditor />
}
