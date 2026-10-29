'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { z } from 'zod'

import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

// Revisão do runtime em vigor (P4-01, D-P4-01-3): lida uma vez por carga da
// casca (GET /api/orchestrator/runtime) e trocada pela `runtimeRevision` de
// cada escrita aceita, sem outro request nem polling (D-P4-01-1). `loading`
// até a leitura responder; `unavailable` se ela falhou.
type RevisionState = number | 'loading' | 'unavailable'

// Valor e setter em contextos separados: quem só grava (editores, ações) não
// re-renderiza quando a revisão muda, e a casca não re-renderiza nunca (o
// estado fica no provider, que recebe a casca pronta em `children`).
const RevisionContext = createContext<RevisionState>('loading')
const SetRevisionContext = createContext<(revision: number) => void>(() => undefined)

const revisionSchema = z.number().int().nonnegative()
const responseSchema = z.object({
  success: z.literal(true),
  data: z.object({ revision: revisionSchema })
})

export function RuntimeRevisionProvider({ children }: { children: React.ReactNode }) {
  const [revision, setRevision] = useState<RevisionState>('loading')

  useEffect(() => {
    const controller = new AbortController()
    // Escrita que respondeu antes da leitura já trouxe uma revisão mais nova.
    const settle = (read: RevisionState) =>
      setRevision((current) => (current === 'loading' ? read : current))
    fetch('/api/orchestrator/runtime', { signal: controller.signal })
      .then(async (response) => {
        const body = responseSchema.safeParse(response.ok ? await response.json() : null)
        settle(body.success ? body.data.data.revision : 'unavailable')
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        console.error('Error loading runtime revision:', error)
        settle('unavailable')
      })
    return () => controller.abort()
  }, [])

  return (
    <SetRevisionContext.Provider value={setRevision}>
      <RevisionContext.Provider value={revision}>{children}</RevisionContext.Provider>
    </SetRevisionContext.Provider>
  )
}

/**
 * Para a escrita aceita: grava na casca a `runtimeRevision` que o BFF mandou
 * (sem request) e a devolve para o status ou o toast. Sem ela, ou inválida,
 * devolve `undefined` ("aplicada" sem número) e o indicador não muda.
 */
export function useApplyRevision() {
  const setRevision = useContext(SetRevisionContext)
  return (body: { runtimeRevision?: unknown }) => {
    const revision = revisionSchema.safeParse(body.runtimeRevision)
    if (!revision.success) return undefined
    setRevision(revision.data)
    return revision.data
  }
}

/**
 * "runtime · rev. N" no rodapé da navegação e do Sheet (P4-01 §4): neutro,
 * sem cor de status nem ícone, não interativo. O texto visível é `aria-hidden`
 * e a frase inteira vai ao leitor de tela.
 */
export function RuntimeRevision({ className }: { className?: string }) {
  const revision = useContext(RevisionContext)
  const t = useTranslations('nav')
  const unavailable = revision === 'unavailable'

  return (
    <div
      aria-busy={revision === 'loading' || undefined}
      title={unavailable ? t('runtimeUnavailableHint') : undefined}
      className={cn(
        'flex h-6 items-center gap-1.5 px-3 font-mono text-xs text-muted-foreground',
        className
      )}
    >
      <span aria-hidden="true">{t('runtimeLabel')}</span>
      {revision === 'loading' ? (
        <Skeleton aria-hidden="true" className="h-3 w-6" />
      ) : (
        <span
          aria-hidden="true"
          className={unavailable ? undefined : 'font-medium tabular-nums text-foreground'}
        >
          {unavailable ? t('runtimeUnavailableShort') : revision}
        </span>
      )}
      <span className="sr-only">
        {revision === 'loading'
          ? t('runtimeLoading')
          : unavailable
            ? t('runtimeUnavailable')
            : t('runtimeRevision', { revision })}
      </span>
    </div>
  )
}
