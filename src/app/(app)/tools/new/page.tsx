import type { Metadata } from 'next'

import { ToolEditor } from '@/components/management/tools/ToolEditor'

export const metadata: Metadata = { title: 'Nova tool' }

export default function NewToolPage() {
  return <ToolEditor />
}
