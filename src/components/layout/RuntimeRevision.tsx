'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { CircleCheck, CircleX, TriangleAlert } from 'lucide-react'
import { z } from 'zod'

import { Skeleton } from '@/components/ui/skeleton'
import { runtimeHealthSchema, type RuntimeHealth } from '@/lib/runtimeHealth'
import { cn, focusRing } from '@/lib/utils'

// Saúde do orquestrador e revisão do runtime (P4-01, P4-05): uma leitura do
// GET /api/orchestrator/runtime por carga da casca, sem polling, que o
// indicador do rodapé e a /settings compartilham. "Atualizar" refaz a mesma
// leitura. A escrita aceita (e a recarga) troca só a revisão, sem request; o
// estado de saúde só muda por leitura (D-P4-05-12).
type HealthRead =
  | { status: 'loading' }
  | { status: 'unavailable'; code?: string }
  | { status: 'ready'; health: RuntimeHealth; readAt: Date }

// Com a saúde lida, `revision` é a mais nova que se conhece: a da leitura ou a
// de uma escrita aceita depois dela.
export type RuntimeState =
  | Exclude<HealthRead, { status: 'ready' }>
  | (Extract<HealthRead, { status: 'ready' }> & { revision: number })

// `written`: a revisão de uma escrita mais nova que a última leitura.
type ProviderState = { read: HealthRead; written?: number }

type RuntimeActions = {
  setRevision: (revision: number) => void
  /** Refaz a leitura; resolve `true` se ela trouxe a saúde. */
  refresh: () => Promise<boolean>
}

// Valor e ações em contextos separados: quem só grava (editores, ações) não
// re-renderiza quando a leitura muda, e a casca não re-renderiza nunca (o
// estado fica no provider, que recebe a casca pronta em `children`).
const RuntimeContext = createContext<RuntimeState>({ status: 'loading' })
const RuntimeActionsContext = createContext<RuntimeActions>({
  setRevision: () => undefined,
  refresh: async () => false
})

const revisionSchema = z.number().int().nonnegative()
const responseSchema = z.object({ success: z.literal(true), data: runtimeHealthSchema })
// O código da falha que o BFF mandou (`unreachable`, `unauthorized`…), para a
// seção da /settings (spec §4); outra coisa no lugar dele não é mostrada.
const failureSchema = z.object({ success: z.literal(false), error: z.string().regex(/^[a-z][a-z_]{0,39}$/) })

// `null`: leitura abortada (desmontou ou foi substituída), ninguém a usa.
async function readHealth(signal: AbortSignal): Promise<HealthRead | null> {
  try {
    const response = await fetch('/api/orchestrator/runtime', { signal })
    const json: unknown = await response.json().catch(() => null)
    const body = responseSchema.safeParse(response.ok ? json : null)
    if (body.success) return { status: 'ready', health: body.data.data, readAt: new Date() }
    const failure = failureSchema.safeParse(json)
    return failure.success ? { status: 'unavailable', code: failure.data.error } : { status: 'unavailable' }
  } catch (error) {
    if (signal.aborted) return null
    console.error('Error loading orchestrator health:', error)
    return { status: 'unavailable' }
  }
}

export function RuntimeRevisionProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ProviderState>({ read: { status: 'loading' } })
  // Leitura em curso; `wrote`: uma escrita respondeu depois que ela saiu, e a
  // revisão dela é mais nova que a que a leitura vai trazer.
  const reading = useRef<{ controller: AbortController; wrote: boolean } | null>(null)

  const refresh = useCallback(async () => {
    reading.current?.controller.abort()
    const current = { controller: new AbortController(), wrote: false }
    reading.current = current
    const read = await readHealth(current.controller.signal)
    if (reading.current !== current || read === null) return false
    reading.current = null
    setState((previous) => ({
      read,
      written: read.status === 'ready' && !current.wrote ? undefined : previous.written
    }))
    return read.status === 'ready'
  }, [])

  const setRevision = useCallback((revision: number) => {
    if (reading.current) reading.current.wrote = true
    setState((previous) => ({ ...previous, written: revision }))
  }, [])

  useEffect(() => {
    void refresh()
    return () => {
      reading.current?.controller.abort()
      reading.current = null
    }
  }, [refresh])

  const actions = useMemo(() => ({ setRevision, refresh }), [setRevision, refresh])
  const value = useMemo<RuntimeState>(
    () =>
      state.read.status === 'ready'
        ? { ...state.read, revision: state.written ?? state.read.health.revision }
        : state.read,
    [state]
  )

  return (
    <RuntimeActionsContext.Provider value={actions}>
      <RuntimeContext.Provider value={value}>{children}</RuntimeContext.Provider>
    </RuntimeActionsContext.Provider>
  )
}

/** A leitura de saúde e a revisão em vigor (indicador e /settings). */
export const useRuntimeState = () => useContext(RuntimeContext)

/** "Atualizar" e "Tentar de novo" da /settings: refazem a leitura da casca. */
export const useRefreshRuntime = () => useContext(RuntimeActionsContext).refresh

/**
 * Para a escrita aceita: grava na casca a `runtimeRevision` que o BFF mandou
 * (sem request) e a devolve para o status ou o toast. Sem ela, ou inválida,
 * devolve `undefined` ("aplicada" sem número) e o indicador não muda.
 */
export function useApplyRevision() {
  const { setRevision } = useContext(RuntimeActionsContext)
  return (body: { runtimeRevision?: unknown }) => {
    const revision = revisionSchema.safeParse(body.runtimeRevision)
    if (!revision.success) return undefined
    setRevision(revision.data)
    return revision.data
  }
}

const CONNECTION = {
  healthy: { icon: CircleCheck, color: 'text-success', label: 'connectionOnline', sr: 'connectionOnlineSr' },
  degraded: { icon: TriangleAlert, color: 'text-warning', label: 'connectionDegraded', sr: 'connectionDegradedSr' }
} as const

/**
 * Status de conexão no rodapé da navegação e do Sheet (P4-05 §2), link para a
 * /settings: "online · rev. N", "degradado · rev. N" ou "fora do ar", com
 * ícone e cor. O texto visível é `aria-hidden` e a frase inteira vai ao
 * leitor de tela (é o nome do link).
 */
export function RuntimeRevision({
  className,
  onNavigate
}: {
  className?: string
  /** No Sheet: fecha o menu ao navegar. */
  onNavigate?: () => void
}) {
  const runtime = useRuntimeState()
  const t = useTranslations('nav')
  const offline = runtime.status === 'unavailable'

  const content = () => {
    if (runtime.status === 'loading')
      return (
        <>
          <span aria-hidden="true">{t('runtimeLabel')}</span>
          <Skeleton aria-hidden="true" className="h-3 w-6" />
          <span className="sr-only">{t('connectionLoading')}</span>
        </>
      )
    if (offline)
      return (
        <>
          <CircleX aria-hidden="true" className="size-3.5 shrink-0 text-destructive" />
          <span aria-hidden="true" className="font-medium text-destructive">
            {t('connectionOffline')}
          </span>
          <span className="sr-only">{t('connectionOfflineSr')}</span>
        </>
      )
    const { icon: Icon, color, label, sr } = CONNECTION[runtime.health.status]
    return (
      <>
        <Icon aria-hidden="true" className={cn('size-3.5 shrink-0', color)} />
        <span aria-hidden="true">
          <span className={cn('font-medium', color)}>{t(label)}</span> {t('revisionLabel')}{' '}
          <span className="font-medium tabular-nums text-foreground">{runtime.revision}</span>
        </span>
        <span className="sr-only">{t(sr, { revision: runtime.revision })}</span>
      </>
    )
  }

  return (
    <Link
      href="/settings"
      prefetch={false}
      onClick={onNavigate}
      aria-busy={runtime.status === 'loading' || undefined}
      title={offline ? t('connectionOfflineHint') : undefined}
      className={cn(
        'flex h-6 items-center gap-1.5 rounded-md px-3 font-mono text-xs text-muted-foreground transition-colors hover:bg-accent',
        focusRing,
        className
      )}
    >
      {content()}
    </Link>
  )
}
