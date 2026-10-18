'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Compass } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Chip, EmptyState } from '@/components/ui/loading'
import { useNotFoundPage } from './AppShell'

// 404 de rota (V-P1-05-15): padrão não encontrado na casca, sem role="alert"
// (o anúncio de rota do Next lê o <title>). Avisa a casca para nenhum item da
// navegação ficar ativo e a trilha mostrar só o título.
export function NotFoundState() {
  const pathname = usePathname()
  const t = useTranslations('notFound')
  const tc = useTranslations('common')
  const tm = useTranslations('metadata')
  useNotFoundPage()

  // O <title> vem do generateMetadata do not-found.tsx; o `next dev` 15.2.3
  // não o aplica quando o notFound() sobe do SSR (o build de produção aplica).
  const title = tm('titleTemplate').replace('%s', t('title'))
  useEffect(() => {
    document.title = title
  }, [title])

  return (
    <div className="p-4 lg:p-6">
      <EmptyState
        icon={<Compass className="text-muted-foreground" />}
        eyebrow={<Chip>{t('status')}</Chip>}
        title={t('title')}
        titleAs="h1"
        description={t.rich('description', {
          path: () => <span className="font-mono text-foreground">{pathname}</span>
        })}
        actions={
          <Button asChild>
            <Link href="/">{tc('goHome')}</Link>
          </Button>
        }
        className="mx-auto mt-6 max-w-[640px] lg:mt-12"
      />
    </div>
  )
}
