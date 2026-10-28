'use client'

import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { type LucideIcon } from 'lucide-react'

import { usePageLabel } from '@/components/layout/AppShell'
import { Button } from '@/components/ui/button'
import {
  Chip,
  EmptyState,
  focusHeadingIfLost,
  LoadErrorState,
  LoadingSpinner
} from '@/components/ui/loading'

type LoadState<T> =
  | { status: 'loading' }
  // `generation` muda quando o editor deve recomeçar (recarregar a atual).
  | { status: 'ready'; entity: T; generation: number }
  | { status: 'error'; code?: number }

// O que o editor pode pedir ao carregador (P3-06): recarregar do servidor,
// trocar pela versão que já tem em mãos (o formulário recomeça) ou só pôr a
// versão e o estado novos (o formulário fica como está).
export type EntityControls<T> = {
  reload: () => void
  replace: (entity: T) => void
  /** Troca a entidade inteira sem remontar (campo ausente na nova some). */
  set: (entity: T) => void
  update: (patch: Partial<T>) => void
}

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
  children: (entity: T, controls: EntityControls<T>) => React.ReactNode
}) {
  const [state, setState] = useState<LoadState<T>>({ status: 'loading' })
  const tn = useTranslations('notFound')
  // Depois de recarregar ou trocar, o foco que se perdeu vai ao h1 do editor.
  const refocus = useRef(false)

  const load = useCallback(
    async (isCurrent: () => boolean = () => true): Promise<boolean> => {
      try {
        const response = await fetch(url)
        const body = response.ok ? await response.json() : null
        if (!isCurrent()) return false
        if (body?.success) {
          setState((prev) => ({
            status: 'ready',
            entity: body.data as T,
            generation: prev.status === 'ready' ? prev.generation + 1 : 0
          }))
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

  const controls: EntityControls<T> = {
    reload: () => {
      refocus.current = true
      setState({ status: 'loading' })
      void load()
    },
    replace: (entity) => {
      refocus.current = true
      setState((prev) => ({
        status: 'ready',
        entity,
        generation: prev.status === 'ready' ? prev.generation + 1 : 0
      }))
    },
    set: (entity) =>
      setState((prev) => (prev.status === 'ready' ? { ...prev, entity } : prev)),
    update: (patch) =>
      setState((prev) =>
        prev.status === 'ready' ? { ...prev, entity: { ...prev.entity, ...patch } } : prev
      )
  }

  useEffect(() => {
    if (state.status !== 'ready' || !refocus.current) return
    refocus.current = false
    focusHeadingIfLost()
  }, [state])

  usePageLabel(state.status === 'ready' ? getLabel(state.entity) : undefined)

  if (state.status === 'loading')
    return (
      <div aria-busy="true">
        <LoadingSpinner text={texts.loading} />
      </div>
    )

  if (state.status === 'ready')
    return <Fragment key={state.generation}>{children(state.entity, controls)}</Fragment>

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
