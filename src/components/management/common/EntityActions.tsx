'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import Link from 'next/link'
import { ExternalLink, Info, Loader2, Power, PowerOff, Trash2 } from 'lucide-react'
import { z } from 'zod'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { focusHeadingIfLost } from '@/components/ui/loading'
import { useRequestError } from './useRequestError'

type Action = 'delete' | 'deactivate' | 'reactivate'
// `confirm`: a confirmação; `blocked`: agent membro de teams (409, D-P3-04-2);
// `changed`: a config mudou antes da ação (412, P3-06).
type View = { kind: 'confirm' } | { kind: 'blocked'; teams: string[] } | { kind: 'changed' }

// O que o BFF devolve ao desativar ou reativar: o documento; aqui só a versão
// nova e o estado.
const writtenSchema = z.object({ version: z.number().int(), active: z.boolean() })
export type Written = z.infer<typeof writtenSchema>

// Ids dos teams do corpo do 409 (`used_by.teams`); corpo fora disso ⇒ nenhum.
async function usedByTeams(response: Response): Promise<string[]> {
  try {
    const body: unknown = await response.json()
    const used =
      typeof body === 'object' && body !== null && 'used_by' in body ? body.used_by : undefined
    const teams =
      typeof used === 'object' && used !== null && 'teams' in used ? used.teams : undefined
    return Array.isArray(teams)
      ? teams.filter((id): id is string => typeof id === 'string' && id !== '')
      : []
  } catch {
    // Corpo que não é JSON: fica o texto genérico.
    return []
  }
}

const BUTTON = 'h-10 w-full sm:h-9 sm:w-auto'

/**
 * Rodapé esquerdo do editor: "Desativar"/"Reativar" (P3-06) e "Excluir"
 * (P1-05b). Desativar e Excluir confirmam no Dialog; Reativar vai direto. O
 * 409 (agent em team) troca o Dialog pela lista dos teams; o 412 pelo aviso
 * de que a config mudou, com "Recarregar".
 * Excluir com sucesso: toast e `onDeleted` (volta para a lista), com o Dialog
 * aberto em "Excluindo…" até a troca de rota. Desativar e Reativar com
 * sucesso: toast e `onChanged` (a página fica). Falha: o Dialog fecha, o foco
 * volta ao botão e o form fica como estava.
 */
export function EntityActions({
  kind,
  id,
  name,
  version,
  active,
  isDirty,
  disabled,
  reactivateBody,
  onDeleted,
  onChanged,
  onReload,
  onBusyChange
}: {
  kind: 'agents' | 'teams' | 'tools'
  id: string
  name: string
  /** Versão lida da config: vai no If-Match (P2-06). */
  version: number
  active: boolean
  /** O formulário tem edições não salvas? (lido ao abrir o Dialog). */
  isDirty: () => boolean
  disabled: boolean
  /** Corpo do PUT que reativa: o documento carregado com `active: true`. */
  reactivateBody: () => string
  onDeleted: () => void
  onChanged: (written: Written) => void
  /** Recarrega o editor com a versão atual (depois do 412). */
  onReload: () => void
  /** Avisa o formulário que uma ação está em andamento (o resto do rodapé desabilita). */
  onBusyChange: (busy: boolean) => void
}) {
  const [dialog, setDialog] = useState<{ action: Action; view: View } | null>(null)
  const [busy, setBusy] = useState<Action | null>(null)
  const [refocusToggle, setRefocusToggle] = useState(false)
  const toggleRef = useRef<HTMLButtonElement>(null)
  const deleteRef = useRef<HTMLButtonElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  // Botão a que o foco volta ao fechar: o da ação aberta por último.
  const origin = useRef<Action>('delete')
  const deleted = useRef(false)
  const requestError = useRequestError()
  const t = useTranslations(kind)
  const ta = useTranslations('agents')
  const tc = useTranslations('common')
  const url = `/api/${kind}/${encodeURIComponent(id)}`

  // A troca de rota desmonta o editor (e o Dialog com o foco) depois do commit
  // da lista: o foco vai para o h1 dela.
  useEffect(
    () => () => {
      if (deleted.current) focusHeadingIfLost()
    },
    []
  )

  // O botão que tinha o foco some ou muda de lugar: o foco vai ao "Fechar".
  const view = dialog?.view.kind
  useEffect(() => {
    if (view === 'blocked' || view === 'changed') closeRef.current?.focus()
  }, [view])

  // Reativar mantém o foco no botão (que ficou desabilitado durante o envio).
  useEffect(() => {
    if (!refocusToggle) return
    toggleRef.current?.focus()
    setRefocusToggle(false)
  }, [refocusToggle])

  const run = async (action: Action) => {
    origin.current = action
    setBusy(action)
    const headers = { 'If-Match': `"${version}"` }
    let status: number | undefined
    try {
      const response =
        action === 'reactivate'
          ? await fetch(url, {
              method: 'PUT',
              headers: { ...headers, 'Content-Type': 'application/json' },
              body: reactivateBody()
            })
          : await fetch(action === 'deactivate' ? `${url}?soft=true` : url, {
              method: 'DELETE',
              headers
            })
      const data = response.ok ? await response.json() : null
      if (action === 'delete' && data?.success) {
        deleted.current = true
        toast.success(t('deleted'))
        onDeleted()
        return
      }
      const written = data?.success ? writtenSchema.safeParse(data.data) : undefined
      if (action !== 'delete' && written?.success) {
        toast.success(action === 'deactivate' ? t('deactivated') : t('reactivated'))
        onChanged(written.data)
        setDialog(null)
        setBusy(null)
        if (action === 'reactivate') setRefocusToggle(true)
        return
      }
      status = response.ok ? undefined : response.status
      if (status === 412) {
        setDialog({ action, view: { kind: 'changed' } })
        setBusy(null)
        return
      }
      if (status === 409 && kind === 'agents') {
        setDialog({ action, view: { kind: 'blocked', teams: await usedByTeams(response) } })
        setBusy(null)
        return
      }
    } catch (error) {
      console.error('Error on', action, url, error)
    }
    const failed = {
      delete: t('deleteError'),
      deactivate: t('deactivateError'),
      reactivate: t('reactivateError')
    }[action]
    toast.error(requestError(status, { failed, notFound: t('notFound') }))
    setBusy(null)
    setDialog(null)
  }

  const open = (action: Action) => {
    origin.current = action
    setDialog({ action, view: { kind: 'confirm' } })
  }

  const current = dialog?.view
  const action = dialog?.action
  const blockedTeams = current?.kind === 'blocked' ? current.teams : []
  const running = busy !== null
  useEffect(() => onBusyChange(running), [running, onBusyChange])
  const dirty = dialog !== null && isDirty()

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
      <Button
        ref={toggleRef}
        type="button"
        variant="outline"
        disabled={disabled || running}
        className={BUTTON}
        onClick={() => (active ? open('deactivate') : void run('reactivate'))}
      >
        {busy === 'reactivate' ? (
          <Loader2 aria-hidden="true" className="animate-spin" />
        ) : active ? (
          <PowerOff aria-hidden="true" />
        ) : (
          <Power aria-hidden="true" />
        )}
        {busy === 'reactivate'
          ? tc('reactivating')
          : active
            ? t('deactivateLabel')
            : t('reactivateLabel')}
      </Button>
      <Button
        ref={deleteRef}
        type="button"
        variant="outline"
        disabled={disabled || running}
        className={`${BUTTON} text-destructive hover:text-destructive`}
        onClick={() => open('delete')}
      >
        <Trash2 aria-hidden="true" />
        {t('deleteLabel')}
      </Button>

      <Dialog
        open={dialog !== null}
        onOpenChange={(next) => !next && !running && setDialog(null)}
      >
        <DialogContent
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            ;(origin.current === 'delete' ? deleteRef : toggleRef).current?.focus()
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {current?.kind === 'blocked'
                ? ta('deleteBlockedTitle')
                : current?.kind === 'changed'
                  ? t('conflictTitle')
                  : action === 'deactivate'
                    ? t('deactivateTitle')
                    : t('deleteTitle')}
            </DialogTitle>
            <div aria-live="polite">
              <DialogDescription>
                {current?.kind === 'blocked'
                  ? blockedTeams.length > 0
                    ? ta('deleteBlockedDescription', { name, count: blockedTeams.length })
                    : ta('deleteBlockedGeneric')
                  : current?.kind === 'changed'
                    ? tc('changedDescription', { action: action ?? 'delete' })
                    : action === 'deactivate'
                      ? t('deactivateDescription', { name })
                      : t('deleteDescription', { name })}
              </DialogDescription>
            </div>
          </DialogHeader>
          {blockedTeams.length > 0 && (
            <ul
              aria-label={ta('deleteBlockedList', { name })}
              className="mt-4 max-h-48 divide-y divide-border overflow-y-auto rounded-md border border-border"
            >
              {blockedTeams.map((team) => (
                <li key={team}>
                  <Link
                    href={`/teams/${encodeURIComponent(team)}`}
                    target="_blank"
                    rel="noopener"
                    className="flex h-10 items-center justify-between gap-2 px-3 font-mono text-sm text-foreground hover:bg-muted hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  >
                    <span className="min-w-0 truncate">
                      {team} <span className="sr-only">{tc('opensInNewTab')}</span>
                    </span>
                    <ExternalLink aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {dirty && (current?.kind === 'changed' || (current?.kind === 'confirm' && action === 'deactivate')) && (
            <p className="mt-4 flex items-start gap-2 rounded-md bg-muted p-3 text-sm text-muted-foreground">
              <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              {current.kind === 'changed' ? tc('changedDirty') : tc('dirtyNote')}
            </p>
          )}
          <DialogFooter className="mt-4">
            {current?.kind === 'confirm' ? (
              <>
                <Button
                  variant="outline"
                  className="h-10 sm:h-9"
                  onClick={() => setDialog(null)}
                  disabled={running}
                >
                  {tc('cancel')}
                </Button>
                <Button
                  variant={action === 'delete' ? 'destructive' : 'default'}
                  className="h-10 sm:h-9"
                  onClick={() => action && void run(action)}
                  disabled={running}
                >
                  {busy === 'delete' || busy === 'deactivate' ? (
                    <>
                      <Loader2 aria-hidden="true" className="animate-spin" />
                      {busy === 'delete' ? tc('deleting') : tc('deactivating')}
                    </>
                  ) : action === 'delete' ? (
                    tc('delete')
                  ) : (
                    tc('deactivate')
                  )}
                </Button>
              </>
            ) : (
              <>
                <Button
                  ref={closeRef}
                  variant="outline"
                  className="h-10 sm:h-9"
                  onClick={() => setDialog(null)}
                >
                  {tc('close')}
                </Button>
                {current?.kind === 'changed' && (
                  <Button className="h-10 sm:h-9" onClick={onReload}>
                    {tc('changedReload')}
                  </Button>
                )}
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
