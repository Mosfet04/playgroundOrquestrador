import type { Metadata } from 'next'

import { ToolManagement } from '@/components/management/tools/ToolManagement'

export const metadata: Metadata = { title: 'Tools' }

export default function ToolsPage() {
  return <ToolManagement />
}
