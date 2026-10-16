import { Suspense } from 'react'
import type { Metadata } from 'next'

import { ChatArea } from '@/components/playground/ChatArea'
import Sidebar from '@/components/playground/Sidebar/Sidebar'

export const metadata: Metadata = { title: 'Playground' }

// ?agent=, ?team= e ?session= (nuqs) leem a URL no cliente: Suspense exigido
// pelo useSearchParams no build estático.
export default function PlaygroundPage() {
  return (
    <Suspense>
      <div className="flex h-full">
        <h1 className="sr-only">Playground</h1>
        <div className="hidden lg:flex">
          <Sidebar />
        </div>
        <ChatArea />
      </div>
    </Suspense>
  )
}
