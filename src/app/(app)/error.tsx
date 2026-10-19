'use client'

import { useEffect, useRef } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { RefreshCw, TriangleAlert } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Chip, EmptyState } from '@/components/ui/loading'

// Erro de render em (app): a casca fica e o conteúdo vira o bloco de erro
// (V-P1-05-17). Nunca mostra error.message nem stack; só o digest como
// referência. O foco vai para "Tentar de novo", a ação principal.
export default function AppError({
  error,
  reset
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const t = useTranslations('errorBoundary')
  const tc = useTranslations('common')
  const retryRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    retryRef.current?.focus()
  }, [])

  return (
    <div className="p-4 lg:p-6">
      <EmptyState
        role="alert"
        icon={<TriangleAlert className="text-destructive" />}
        title={t('title')}
        titleAs="h1"
        description={t('description')}
        chips={error.digest && <Chip>{t('reference', { digest: error.digest })}</Chip>}
        actions={
          <>
            <Button ref={retryRef} onClick={reset}>
              <RefreshCw aria-hidden="true" />
              {tc('retry')}
            </Button>
            <Button asChild variant="outline">
              <Link href="/">{tc('goHome')}</Link>
            </Button>
          </>
        }
        className="mx-auto mt-6 max-w-[640px] lg:mt-12"
      />
    </div>
  )
}
