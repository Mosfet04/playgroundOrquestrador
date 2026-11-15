'use client'

import { useEffect, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { AlertCircle, Loader2, Undo2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import type { DiffRow } from '@/lib/formDiff'
import { ErrorTypeCode } from './ApplyStatus'
import { DiffList } from './DiffList'

const BUTTON = 'h-11 w-full sm:h-9 sm:w-auto'

/**
 * "Restaurar a vN?" (P4-04 §2.6): o que muda da versão atual para a escolhida,
 * o aviso de edição não salva (D-P4-04-2) e, no 422, o motivo sem fechar. Só
 * existe montado enquanto a confirmação está aberta.
 */
export function RestoreDialog({
  version,
  current,
  date,
  rows,
  dirty,
  saving,
  rejected,
  onClose,
  onConfirm,
  onCloseAutoFocus
}: {
  /** A versão escolhida no histórico. */
  version: number
  /** A versão lida pelo editor (a restauração grava a seguinte). */
  current: number
  /** Data da versão escolhida, já formatada. */
  date: string
  rows: DiffRow[]
  /** O formulário tem edições não salvas? */
  dirty: boolean
  saving: boolean
  /** 422: a versão não monta mais no runtime (com o tipo do erro ou o campo, se vieram). */
  rejected?: { detail?: string }
  onClose: () => void
  onConfirm: () => void
  /** Aberto sem Trigger, o Radix não devolve o foco: quem abriu decide para onde. */
  onCloseAutoFocus: (event: Event) => void
}) {
  const tc = useTranslations('common')
  const contentRef = useRef<HTMLDivElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const same = rows.length === 0

  // Gravando, todos os botões ficam desabilitados: o foco fica no próprio diálogo.
  useEffect(() => {
    if (saving) contentRef.current?.focus()
  }, [saving])

  return (
    <Dialog open onOpenChange={(next) => !next && !saving && onClose()}>
      <DialogContent
        ref={contentRef}
        role="alertdialog"
        className="focus:outline-none sm:max-w-xl"
        closeDisabled={saving}
        aria-busy={saving}
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          cancelRef.current?.focus()
        }}
        onCloseAutoFocus={onCloseAutoFocus}
        onEscapeKeyDown={(event) => saving && event.preventDefault()}
        onInteractOutside={(event) => saving && event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{tc('restoreTitle', { version })}</DialogTitle>
          <DialogDescription>
            {tc.rich('restoreDescription', {
              version,
              next: current + 1,
              date,
              b: (chunks) => <b className="font-semibold text-foreground">{chunks}</b>
            })}
          </DialogDescription>
        </DialogHeader>
        <div className="mt-4 space-y-3">
          {dirty && (
            <p className="flex items-start gap-2 text-sm text-warning">
              <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              {tc('restoreDirty')}
            </p>
          )}
          {same ? (
            <p className="text-sm text-muted-foreground">{tc('restoreSame')}</p>
          ) : (
            <>
              <DiffList rows={rows} variant="review" label={tc('restoreList')} />
              <p className="text-xs text-muted-foreground">{tc('restoreNote', { current })}</p>
            </>
          )}
          {rejected && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-md border border-destructive/50 p-3 text-sm text-destructive"
            >
              <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              <div className="min-w-0 space-y-1">
                <p>{tc('restoreNotApplied', { version })}</p>
                {rejected.detail && (
                  <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    {tc('technicalDetail')}
                    <ErrorTypeCode>{rejected.detail}</ErrorTypeCode>
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
        <DialogFooter className="mt-4">
          <Button ref={cancelRef} variant="outline" className={BUTTON} disabled={saving} onClick={onClose}>
            {tc('cancel')}
          </Button>
          <Button className={BUTTON} disabled={saving || same} onClick={onConfirm}>
            {saving ? <Loader2 aria-hidden="true" className="animate-spin" /> : <Undo2 aria-hidden="true" />}
            {saving ? tc('restoring') : tc('restoreVersion', { version })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
