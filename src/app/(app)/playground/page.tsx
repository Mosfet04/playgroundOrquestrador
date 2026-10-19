import { Suspense } from 'react'
import type { Metadata } from 'next'
import { useTranslations } from 'next-intl'
import { getTranslations } from 'next-intl/server'

import { ChatArea } from '@/components/playground/ChatArea'
import Sidebar from '@/components/playground/Sidebar/Sidebar'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('nav')
  return { title: t('playground') }
}

// ?agent=, ?team= e ?session= (nuqs) leem a URL no cliente: Suspense exigido
// pelo useSearchParams no build estático.
export default function PlaygroundPage() {
  const t = useTranslations('nav')
  return (
    <Suspense>
      <div className="flex h-full">
        <h1 tabIndex={-1} className="sr-only">
          {t('playground')}
        </h1>
        <div className="hidden lg:flex">
          <Sidebar />
        </div>
        <ChatArea />
      </div>
    </Suspense>
  )
}
