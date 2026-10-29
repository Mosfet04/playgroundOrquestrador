'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import type { FieldValues, UseFormGetValues, UseFormWatch } from 'react-hook-form'
import { CircleAlert, CircleCheck, ExternalLink, RotateCw, TriangleAlert } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { ApplyResult } from './applyResult'

/**
 * Status de aplicação do último Salvar (P4-01 §3.3). Some na primeira mudança
 * de valor do formulário e em `clear` (novo Salvar, início de Desativar,
 * Reativar ou Excluir, tool marcada fora do formulário). A mudança conta pelos
 * valores, não pelo evento: o `reset` para o documento salvo e o que o
 * react-hook-form emite depois dele não são edição. Ao aparecer, o foco volta
 * ao Salvar, que ficou desabilitado durante o envio e perdeu o foco.
 */
export function useApplyStatus<T extends FieldValues>(
  { watch, getValues }: { watch: UseFormWatch<T>; getValues: UseFormGetValues<T> },
  saveRef: RefObject<HTMLButtonElement | null>
) {
  const [result, setResult] = useState<ApplyResult | null>(null)
  // Valores do formulário quando o status apareceu (null: sem status).
  const shownWith = useRef<string | null>(null)

  useEffect(() => {
    const subscription = watch((values) => {
      if (shownWith.current === null || JSON.stringify(values) === shownWith.current) return
      shownWith.current = null
      setResult(null)
    })
    return () => subscription.unsubscribe()
  }, [watch])

  useEffect(() => {
    if (result) saveRef.current?.focus()
  }, [result, saveRef])

  const show = (next: ApplyResult) => {
    shownWith.current = JSON.stringify(getValues())
    setResult(next)
  }
  const clear = useCallback(() => {
    shownWith.current = null
    setResult(null)
  }, [])

  return { result, show, clear }
}

/** Descrição do toast de uma escrita aplicada (criar, excluir, desativar, reativar). */
export function useAppliedText() {
  const tc = useTranslations('common')
  return (revision: number | undefined) =>
    revision === undefined
      ? tc('applied')
      : tc.rich('appliedRevision', { revision, n: (chunks) => chunks })
}

/** O `errorType` (nome da exceção da montagem) como detalhe técnico, em mono. */
export function ErrorTypeCode({ children }: { children: ReactNode }) {
  return (
    <code className="break-all rounded-sm border border-border bg-muted px-1.5 font-mono text-xs text-foreground">
      {children}
    </code>
  )
}

const BLOCK = 'mb-4 flex gap-3 rounded-lg border bg-card p-3 text-sm'
const ICON = 'mt-0.5 size-4 shrink-0'
const BODY = 'flex min-w-0 flex-1 flex-col gap-1'
const ACTION = 'h-10 w-full md:h-9 md:w-auto'

/**
 * Bloco acima da linha de botões do editor (P4-01 §3): aplicada, não aplicada
 * ou não confirmada. A região viva fica sempre montada e, vazia, não ocupa
 * espaço (o espaço até os botões é o `mb-4` do bloco). Sem `onReload` é a
 * criação: o "não confirmada" leva à lista em nova aba, sem perder o formulário.
 */
export function ApplyStatus({
  kind,
  result,
  onReload,
  isDirty
}: {
  kind: 'agents' | 'teams' | 'tools'
  result: ApplyResult | null
  /** Edição: relê a entidade (o "não confirmada" mostra "Recarregar"). */
  onReload?: () => void
  /** O formulário tem edições não salvas? (lido só no "não confirmada" da edição). */
  isDirty?: () => boolean
}) {
  const t = useTranslations(kind)
  const tc = useTranslations('common')

  return (
    <div aria-live="polite" aria-atomic="true">
      {result?.status === 'applied' && (
        <div className={cn(BLOCK, 'items-start border-border py-2.5 sm:items-center')}>
          <CircleCheck aria-hidden="true" className={cn(ICON, 'text-success sm:mt-0')} />
          <p className="min-w-0 flex-1">
            <span className="font-medium text-foreground">{tc('sentence', { text: t('saved') })}</span>{' '}
            <span className="text-muted-foreground">
              {result.revision === undefined
                ? tc('applied')
                : tc.rich('appliedRevision', {
                    revision: result.revision,
                    n: (chunks) => <span className="font-mono tabular-nums">{chunks}</span>
                  })}
            </span>
          </p>
        </div>
      )}
      {result?.status === 'not_applied' && (
        <div className={cn(BLOCK, 'items-start border-destructive/50')}>
          <CircleAlert aria-hidden="true" className={cn(ICON, 'text-destructive')} />
          <div className={BODY}>
            <p className="font-medium text-destructive">{tc('notAppliedTitle')}</p>
            <p className="text-muted-foreground">{tc('notAppliedBody')}</p>
            {result.errorType && (
              <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                {tc('technicalDetail')}
                <ErrorTypeCode>{result.errorType}</ErrorTypeCode>
              </p>
            )}
          </div>
        </div>
      )}
      {result?.status === 'not_confirmed' && (
        <div className={cn(BLOCK, 'items-start border-warning/50')}>
          <TriangleAlert aria-hidden="true" className={cn(ICON, 'text-warning')} />
          <div className={BODY}>
            <p className="font-medium text-warning">{tc('notConfirmedTitle')}</p>
            <p className="text-muted-foreground">
              {onReload ? t('notConfirmedBody') : t('notConfirmedCreated')}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
              {onReload ? (
                <>
                  <Button type="button" variant="outline" className={ACTION} onClick={onReload}>
                    <RotateCw aria-hidden="true" />
                    {t('reload')}
                  </Button>
                  {isDirty?.() && (
                    <p className="grow basis-48 text-xs text-muted-foreground">{tc('changedDirty')}</p>
                  )}
                </>
              ) : (
                <Button variant="outline" asChild className={ACTION}>
                  <Link href={`/${kind}`} target="_blank" rel="noopener" prefetch={false}>
                    <ExternalLink aria-hidden="true" />
                    {tc('checkInList')} <span className="sr-only">{tc('opensInNewTab')}</span>
                  </Link>
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
