'use client'

import { useEffect, useRef, type RefObject } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { CircleAlert, Loader2, TriangleAlert } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { LiveStatus } from '@/components/ui/loading'
import { Skeleton } from '@/components/ui/skeleton'
import { DiffList } from './DiffList'
import type { ConflictState } from './useSaveConflict'

const BUTTON = 'h-10 w-full sm:h-9 sm:w-auto'

/**
 * Diálogo do 412 ao salvar (P3-06, D-P3-06-1): o que difere entre o formulário
 * e a versão atual, com três saídas. A foto da versão atual vem do
 * `useSaveConflict`; aqui só se mostra e se escolhe.
 */
export function ConflictDialog<T extends { version: number }>({
  kind,
  name,
  listHref,
  state,
  mine,
  saveRef,
  onClose,
  onRetry,
  onReload,
  onOverwrite
}: {
  kind: 'agents' | 'teams' | 'tools'
  /** Nome do que está sendo editado (a mensagem de "excluído"). */
  name: string
  listHref: string
  state: ConflictState<T>
  /** Versão que o usuário estava editando. */
  mine: number
  /** O Salvar do formulário: o foco volta a ele ao fechar. */
  saveRef: RefObject<HTMLButtonElement | null>
  onClose: () => void
  onRetry: () => void
  onReload: (current: T) => void
  onOverwrite: () => void
}) {
  const t = useTranslations(kind)
  const tc = useTranslations('common')
  const backRef = useRef<HTMLButtonElement>(null)
  const retryRef = useRef<HTMLButtonElement>(null)
  const { status } = state
  const saving = status === 'ready' && state.saving

  // Foco: a saída sem efeito ("Voltar"); na falha, "Tentar de novo". Reaplica
  // a cada troca de estado (o botão focado pode ter ficado desabilitado).
  useEffect(() => {
    if (status === 'error') retryRef.current?.focus()
    else if (status !== 'closed') backRef.current?.focus()
  }, [status])

  const ready = status === 'ready' ? state : undefined
  const rows = ready?.rows ?? []
  const hasRows = rows.length > 0
  const counts = ready ? { current: ready.current.version, mine, count: rows.length } : undefined

  const description =
    status === 'deleted'
      ? t('conflictDeletedDescription', { name })
      : counts
        ? hasRows
          ? tc('conflictDescription', counts)
          : tc('conflictNoVisible', counts)
        : tc('conflictIntro')

  const back = (
    <Button ref={backRef} variant="outline" className={BUTTON} disabled={saving} onClick={onClose}>
      {tc('conflictBack')}
    </Button>
  )
  const reload = (
    <Button
      variant={hasRows || !ready ? 'default' : 'outline'}
      className={BUTTON}
      disabled={!ready || saving}
      onClick={() => ready && onReload(ready.current)}
    >
      {tc('conflictReload')}
    </Button>
  )
  const overwrite = (
    <Button
      variant={hasRows || !ready ? 'outline' : 'default'}
      className={`${BUTTON} ${hasRows || !ready ? 'text-destructive hover:text-destructive' : ''}`}
      disabled={!ready || saving}
      onClick={onOverwrite}
    >
      {saving && <Loader2 aria-hidden="true" className="animate-spin" />}
      {saving ? tc('saving') : tc('conflictOverwrite')}
    </Button>
  )

  return (
    <Dialog open={status !== 'closed'} onOpenChange={(next) => !next && !saving && onClose()}>
      <DialogContent
        className="sm:max-w-xl"
        aria-busy={status === 'loading' || saving}
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          // O foco volta ao Salvar, salvo se já foi para outro lugar (o campo com erro).
          const active = document.activeElement
          if (!active || active === document.body) saveRef.current?.focus()
        }}
        onEscapeKeyDown={(event) => saving && event.preventDefault()}
        onInteractOutside={(event) => saving && event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{status === 'deleted' ? t('conflictDeletedTitle') : t('conflictTitle')}</DialogTitle>
          <div aria-live="polite">
            <DialogDescription>{description}</DialogDescription>
          </div>
        </DialogHeader>

        {status === 'loading' && (
          <div className="mt-4 space-y-3">
            <LiveStatus>{tc('conflictLoading')}</LiveStatus>
            <Skeleton className="h-14" />
          </div>
        )}
        {status === 'error' && (
          <p
            role="alert"
            className="mt-4 flex items-start gap-2 rounded-md border border-destructive/50 p-3 text-sm text-destructive"
          >
            <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            {state.code === undefined
              ? tc('conflictLoadErrorNoCode')
              : tc('conflictLoadError', { status: state.code })}
          </p>
        )}
        {ready && (
          <div className="mt-4 space-y-3">
            {ready.again && (
              <p role="status" className="flex items-start gap-2 text-sm text-warning">
                <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                {tc('conflictAgain')}
              </p>
            )}
            {hasRows ? (
              <>
                <DiffList rows={rows} />
                <p className="text-xs text-muted-foreground">{tc('conflictConsequence')}</p>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">{tc('conflictNoVisibleHelp')}</p>
            )}
          </div>
        )}

        <DialogFooter className="mt-4">
          {back}
          {status === 'error' ? (
            <Button ref={retryRef} className={BUTTON} onClick={onRetry}>
              {tc('retry')}
            </Button>
          ) : status === 'deleted' ? (
            <Button asChild className={BUTTON}>
              <Link href={listHref}>{tc('conflictGoToList')}</Link>
            </Button>
          ) : hasRows || !ready ? (
            <>
              {overwrite}
              {reload}
            </>
          ) : (
            <>
              {reload}
              {overwrite}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
