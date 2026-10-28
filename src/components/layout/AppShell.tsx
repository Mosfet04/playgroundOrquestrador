'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'

import { cn, focusRing } from '@/lib/utils'
import { AppHeader } from './AppHeader'
import { Brand, Navigation } from './Navigation'
import { SignOutButton } from './SignOutButton'

// O nome do agente/tool só chega depois do fetch da página de detalhe; a
// página o entrega à trilha do cabeçalho por aqui.
const PageLabelContext = createContext<(label: string | undefined) => void>(
  () => undefined
)

export function usePageLabel(label: string | undefined) {
  const setPageLabel = useContext(PageLabelContext)
  useEffect(() => {
    setPageLabel(label)
    return () => setPageLabel(undefined)
  }, [label, setPageLabel])
}

// O 404 de rota avisa a casca: nenhum item da navegação ativo e a trilha só
// com "Página não encontrada" (V-P1-05-15), também em /agents/x/y.
const NotFoundContext = createContext<(notFound: boolean) => void>(() => undefined)

export function useNotFoundPage() {
  const setNotFound = useContext(NotFoundContext)
  useEffect(() => {
    setNotFound(true)
    return () => setNotFound(false)
  }, [setNotFound])
}

// Casca das rotas de (app): navegação lateral (lg+), cabeçalho de 56 px e o
// <main id="conteudo">. Abaixo de lg a navegação vai para o Sheet do cabeçalho.
export function AppShell({ children }: { children: React.ReactNode }) {
  const [pageLabel, setPageLabel] = useState<string>()
  const [notFound, setNotFound] = useState(false)
  const t = useTranslations('nav')

  return (
    <PageLabelContext.Provider value={setPageLabel}>
      <a
        href="#conteudo"
        className={cn(
          'sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-popover focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-foreground focus:shadow-popover',
          focusRing
        )}
      >
        {t('skipToContent')}
      </a>
      <div className="flex h-dvh bg-background">
        <div className="hidden w-64 shrink-0 flex-col border-r border-border bg-card lg:flex">
          <div className="flex h-14 shrink-0 items-center px-4">
            <Brand />
          </div>
          <Navigation notFound={notFound} />
          <div className="mt-auto border-t border-border p-3">
            <SignOutButton />
          </div>
        </div>
        <div className="app-main flex min-w-0 flex-1 flex-col">
          <AppHeader pageLabel={pageLabel} notFound={notFound} />
          <main
            id="conteudo"
            tabIndex={-1}
            className="min-h-0 flex-1 overflow-y-auto focus:outline-none"
          >
            <NotFoundContext.Provider value={setNotFound}>
              {children}
            </NotFoundContext.Provider>
          </main>
        </div>
      </div>
    </PageLabelContext.Provider>
  )
}
