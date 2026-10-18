'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { type LucideIcon } from 'lucide-react'

import { usePageLabel } from '@/components/layout/AppShell'
import { Button } from '@/components/ui/button'
import { Chip, EmptyState, LoadErrorState, LoadingSpinner } from '@/components/ui/loading'

type LoadState<T> =
  | { status: 'loading' }
  | { status: 'ready'; entity: T }
  | { status: 'error'; code?: number }

export type EntityLoaderTexts = {
  loading: string
  notFound: string
  loadError: string
  back: string
  backHref: string
}

// Detalhe de agente/tool: spinner com aria-busy até o GET do BFF responder.
// 404 vira o padrão não encontrado (ícone da entidade, id em mono, "Voltar");
// outro erro, o bloco de erro com "Tentar de novo", que refaz o GET (P1-05,
// V-P1-05-16; ícone P1-05b, V-P1-05b-9).
export function EntityLoader<T>({
  url,
  id,
  texts,
  icon: Icon,
  getLabel,
  children
}: {
  url: string
  id: string
  texts: EntityLoaderTexts
  /** Ícone da entidade na navegação (Bot, Wrench). */
  icon: LucideIcon
  getLabel: (entity: T) => string
  children: (entity: T) => React.ReactNode
}) {
  const [state, setState] = useState<LoadState<T>>({ status: 'loading' })
  const tn = useTranslations('notFound')

  const load = useCallback(
    async (isCurrent: () => boolean = () => true): Promise<boolean> => {
      try {
        const response = await fetch(url)
        const body = response.ok ? await response.json() : null
        if (!isCurrent()) return false
        if (body?.success) {
          setState({ status: 'ready', entity: body.data as T })
          return true
        }
        setState({ status: 'error', code: response.status })
      } catch (error) {
        console.error('Error loading entity:', url, error)
        if (isCurrent()) setState({ status: 'error' })
      }
      return false
    },
    [url]
  )

  useEffect(() => {
    let current = true
    setState({ status: 'loading' })
    load(() => current)
    return () => {
      current = false
    }
  }, [load])

  usePageLabel(state.status === 'ready' ? getLabel(state.entity) : undefined)

  if (state.status === 'loading')
    return (
      <div aria-busy="true">
        <LoadingSpinner text={texts.loading} />
      </div>
    )

  if (state.status === 'ready') return children(state.entity)

  const back = (
    <Button asChild variant={state.code === 404 ? 'default' : 'ghost'}>
      <Link href={texts.backHref}>{texts.back}</Link>
    </Button>
  )

  return (
    <div className="mx-auto w-full max-w-2xl p-4 lg:p-6">
      {state.code === 404 ? (
        <EmptyState
          role="alert"
          icon={<Icon className="text-muted-foreground" />}
          eyebrow={<Chip>{tn('status')}</Chip>}
          title={texts.notFound}
          titleAs="h1"
          detail={id}
          actions={back}
        />
      ) : (
        <LoadErrorState
          title={texts.loadError}
          titleAs="h1"
          status={state.code}
          detail={id}
          onRetry={load}
          extraAction={back}
        />
      )}
    </div>
  )
}
