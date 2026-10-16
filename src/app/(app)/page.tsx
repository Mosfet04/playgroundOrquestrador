import type { Metadata } from 'next'

import { GettingStarted } from '@/components/management/GettingStarted'

export const metadata: Metadata = { title: 'Início' }

export default function HomePage() {
  return <GettingStarted />
}
