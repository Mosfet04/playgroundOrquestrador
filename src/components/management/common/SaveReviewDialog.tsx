'use client'

import { useEffect, useRef, type RefObject } from 'react'
import { useTranslations } from 'next-intl'
import { Loader2 } from 'lucide-react'

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
import { DiffList } from './DiffList'

const BUTTON = 'h-10 w-full sm:h-9 sm:w-auto'

/**
 * "Revisar antes de salvar" (P4-02 §4): o que muda em relação à versão lida. Só
 * existe montado enquanto a revisão está aberta: ao fechar some de uma vez, sem
 * animação de saída, e o diálogo de conflito nunca aparece junto dele.
 */
export function SaveReviewDialog({
  rows,
  version,
  saving,
  saveRef,
  onClose,
  onConfirm
}: {
  rows: DiffRow[]
  /** A versão lida: o "Antes". */
  version: number
  saving: boolean
  /** O Salvar do formulário: o foco volta a ele ao fechar. */
  saveRef: RefObject<HTMLButtonElement | null>
  onClose: () => void
  onConfirm: () => void
}) {
  const tc = useTranslations('common')
  const contentRef = useRef<HTMLDivElement>(null)
  const backRef = useRef<HTMLButtonElement>(null)

  // Gravando, todos os botões ficam desabilitados: o foco fica no próprio diálogo.
  useEffect(() => {
    if (saving) contentRef.current?.focus()
  }, [saving])

  return (
    <Dialog open onOpenChange={(next) => !next && !saving && onClose()}>
      <DialogContent
        ref={contentRef}
        className="focus:outline-none sm:max-w-xl"
        closeDisabled={saving}
        aria-busy={saving}
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          backRef.current?.focus()
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          // O foco volta ao Salvar, salvo se já foi para outro lugar (o campo com
          // erro, o diálogo de conflito).
          const active = document.activeElement
          if (!active || active === document.body) saveRef.current?.focus()
        }}
        onEscapeKeyDown={(event) => saving && event.preventDefault()}
        onInteractOutside={(event) => saving && event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{tc('reviewTitle')}</DialogTitle>
          <DialogDescription>{tc('reviewDescription', { count: rows.length, version })}</DialogDescription>
        </DialogHeader>
        <div className="mt-4 space-y-3">
          <DiffList rows={rows} variant="review" />
          <p className="text-xs text-muted-foreground">{tc('reviewNote')}</p>
        </div>
        <DialogFooter className="mt-4">
          <Button ref={backRef} variant="outline" className={BUTTON} disabled={saving} onClick={onClose}>
            {tc('conflictBack')}
          </Button>
          <Button className={BUTTON} disabled={saving} onClick={onConfirm}>
            {saving && <Loader2 aria-hidden="true" className="animate-spin" />}
            {saving ? tc('saving') : tc('reviewConfirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Por que o Salvar está apagado (D-P4-02-1); com o status "aplicada" visível, só para leitor de tela. */
export function NoChangesHint({ id, quiet }: { id: string; quiet: boolean }) {
  const tc = useTranslations('common')
  return (
    <p id={id} className={quiet ? 'sr-only' : 'mb-2 text-xs text-muted-foreground sm:text-right'}>
      {tc('noChanges')}
    </p>
  )
}
