'use client'

import { useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Loader2, RotateCw } from 'lucide-react'
import { z } from 'zod'

import { useApplyRevision } from '@/components/layout/RuntimeRevision'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog'

// Desfecho do POST /api/config/reload (D-P4-05-6/10): a revisão nova; não
// confirmada (5xx do orquestrador ou sem revisão); sem resposta do
// orquestrador (503/504, rede); outra recusa (sessão, Origin, chave), com o
// status. Nenhum fica no diálogo (o reload nunca devolve 422).
export type ReloadOutcome =
  | { kind: 'reloaded'; revision: number; previous: number }
  | { kind: 'not_confirmed' }
  | { kind: 'unreachable' }
  | { kind: 'failed'; status: number }

const UNREACHABLE = new Set([503, 504])
const NOT_CONFIRMED = new Set(['not_confirmed', 'invalid_response'])
// Corpo que não é o do BFF (proxy, HTML) fica vazio e cai pelo status.
const bodySchema = z
  .object({ success: z.boolean().optional(), error: z.string().optional(), runtimeRevision: z.unknown().optional() })
  .catch({})

async function requestReload(
  applyRevision: ReturnType<typeof useApplyRevision>,
  previous: number
): Promise<ReloadOutcome> {
  try {
    const response = await fetch('/api/config/reload', { method: 'POST' })
    const body = bodySchema.parse(await response.json().catch(() => null))
    if (response.ok && body.success) {
      // A revisão vai ao indicador da casca sem novo request.
      const revision = applyRevision(body)
      return revision === undefined
        ? { kind: 'not_confirmed' }
        : { kind: 'reloaded', revision, previous }
    }
    if (UNREACHABLE.has(response.status)) return { kind: 'unreachable' }
    if (body.error && NOT_CONFIRMED.has(body.error)) return { kind: 'not_confirmed' }
    return { kind: 'failed', status: response.status }
  } catch (error) {
    console.error('Error reloading runtime:', error)
    return { kind: 'unreachable' }
  }
}

const BUTTON = 'h-11 w-full sm:h-9 sm:w-auto'

/**
 * "Recarregar runtime" e a confirmação (P4-05 §5): foco inicial em Cancelar;
 * recarregando, tudo desabilitado e Esc ignorado. Fecha em todo desfecho; no
 * sucesso o foco vai ao `h1`, nos outros volta ao botão.
 */
export function ReloadDialog({
  revision,
  onStart,
  onDone,
  disabled,
  triggerClassName
}: {
  /** A revisão em vigor, mostrada e usada como "era N" no sucesso. */
  revision: number
  onStart: () => void
  onDone: (outcome: ReloadOutcome) => void
  /** "Atualizar" em curso: uma ação não corre durante a outra. */
  disabled?: boolean
  triggerClassName?: string
}) {
  const t = useTranslations('settings')
  const tc = useTranslations('common')
  const applyRevision = useApplyRevision()
  const [open, setOpen] = useState(false)
  const [reloading, setReloading] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const reloaded = useRef(false)

  const confirm = async () => {
    onStart()
    setReloading(true)
    // Os botões desabilitados perdem o foco: ele fica no próprio diálogo.
    contentRef.current?.focus()
    const outcome = await requestReload(applyRevision, revision)
    reloaded.current = outcome.kind === 'reloaded'
    setReloading(false)
    setOpen(false)
    onDone(outcome)
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !reloading && setOpen(next)}>
      <DialogTrigger asChild>
        <Button variant="outline" disabled={disabled} className={triggerClassName}>
          <RotateCw aria-hidden="true" />
          {t('reload')}
        </Button>
      </DialogTrigger>
      <DialogContent
        ref={contentRef}
        role="alertdialog"
        className="focus:outline-none sm:max-w-lg"
        closeDisabled={reloading}
        aria-busy={reloading}
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          reloaded.current = false
          cancelRef.current?.focus()
        }}
        onCloseAutoFocus={(event) => {
          if (!reloaded.current) return
          event.preventDefault()
          document.querySelector<HTMLElement>('h1')?.focus()
        }}
        onEscapeKeyDown={(event) => reloading && event.preventDefault()}
        onInteractOutside={(event) => reloading && event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{t('reloadTitle')}</DialogTitle>
          <DialogDescription>{t('reloadDescription')}</DialogDescription>
        </DialogHeader>
        <p className="mt-3 text-sm text-muted-foreground">
          {t.rich('reloadCurrent', {
            revision,
            b: (chunks) => <b className="font-mono font-medium text-foreground">{chunks}</b>
          })}
        </p>
        <DialogFooter className="mt-4">
          <Button
            ref={cancelRef}
            variant="outline"
            className={BUTTON}
            disabled={reloading}
            onClick={() => setOpen(false)}
          >
            {tc('cancel')}
          </Button>
          <Button className={BUTTON} disabled={reloading} onClick={() => void confirm()}>
            {reloading ? (
              <Loader2 aria-hidden="true" className="motion-safe:animate-spin" />
            ) : (
              <RotateCw aria-hidden="true" />
            )}
            {t(reloading ? 'reloading' : 'reload')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
