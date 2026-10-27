'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import Link from 'next/link'
import { ExternalLink, Trash2 } from 'lucide-react'

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
import { focusHeadingIfLost } from '@/components/ui/loading'
import { useRequestError } from './useRequestError'

// Agent membro de teams (P3-04, D-P3-04-2): o 409 traz os ids dos teams e o
// mesmo Dialog passa a listá-los, com link para cada um.
type BlockedTexts = {
  title: string
  description: (count: number) => string
  list: string
  generic: string
  opensInNewTab: string
}

type DeleteTexts = {
  label: string
  title: string
  description: string
  deleted: string
  failed: string
  notFound: string
  /** Só quem pode ser recusado por uso em teams (agent). */
  blocked?: BlockedTexts
}

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

/**
 * "Excluir" do rodapé do editor (P1-05b): confirma no Dialog e faz o DELETE.
 * Deu certo: toast e `onDeleted` (volta para a lista), com o Dialog aberto em
 * "Excluindo…" até a troca de rota. Falhou ou cancelou: o Dialog fecha, o foco
 * volta ao botão (DialogTrigger do Radix) e o form fica como estava.
 */
export function DeleteEntityButton({
  url,
  version,
  texts,
  disabled,
  onDeleted
}: {
  url: string
  /** Versão lida da config: vai no If-Match (P2-06). */
  version: number
  texts: DeleteTexts
  disabled: boolean
  onDeleted: () => void
}) {
  const [open, setOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  // Teams que impedem a exclusão (409); `null` = confirmação normal.
  const [blockedBy, setBlockedBy] = useState<string[] | null>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const requestError = useRequestError()
  const tc = useTranslations('common')
  const deleted = useRef(false)
  const blocked = texts.blocked

  // A troca de rota desmonta o editor (e o Dialog com o foco) depois do commit
  // da lista: o foco vai para o h1 dela.
  useEffect(
    () => () => {
      if (deleted.current) focusHeadingIfLost()
    },
    []
  )

  // O botão "Excluir" que tinha o foco some: o foco vai ao "Fechar".
  useEffect(() => {
    if (blockedBy) closeRef.current?.focus()
  }, [blockedBy])

  const confirm = async () => {
    setDeleting(true)
    let status: number | undefined
    try {
      const response = await fetch(url, {
        method: 'DELETE',
        headers: { 'If-Match': `"${version}"` }
      })
      const data = response.ok ? await response.json() : null
      if (data?.success) {
        deleted.current = true
        toast.success(texts.deleted)
        onDeleted()
        return
      }
      status = response.status
      if (status === 409 && texts.blocked) {
        setBlockedBy(await usedByTeams(response))
        setDeleting(false)
        return
      }
    } catch (error) {
      console.error('Error deleting:', url, error)
    }
    toast.error(requestError(status, { failed: texts.failed, notFound: texts.notFound }))
    setDeleting(false)
    setOpen(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) setBlockedBy(null)
      }}
    >
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          className="h-10 w-full text-destructive hover:text-destructive sm:h-9 sm:w-auto"
        >
          <Trash2 aria-hidden="true" />
          {texts.label}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{blocked && blockedBy ? blocked.title : texts.title}</DialogTitle>
          <div aria-live="polite">
            <DialogDescription>
              {blocked && blockedBy
                ? blockedBy.length > 0
                  ? blocked.description(blockedBy.length)
                  : blocked.generic
                : texts.description}
            </DialogDescription>
          </div>
        </DialogHeader>
        {blocked && blockedBy && blockedBy.length > 0 && (
          <ul
            aria-label={blocked.list}
            className="mt-4 max-h-48 divide-y divide-border overflow-y-auto rounded-md border border-border"
          >
            {blockedBy.map((id) => (
              <li key={id}>
                <Link
                  href={`/teams/${encodeURIComponent(id)}`}
                  target="_blank"
                  rel="noopener"
                  className="flex h-10 items-center justify-between gap-2 px-3 font-mono text-sm text-foreground hover:bg-muted hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                >
                  <span className="min-w-0 truncate">
                    {id}{' '}
                    <span className="sr-only">{blocked.opensInNewTab}</span>
                  </span>
                  <ExternalLink aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        )}
        <DialogFooter className={blocked && blockedBy ? 'mt-4' : undefined}>
          {blocked && blockedBy ? (
            <Button ref={closeRef} variant="outline" onClick={() => setOpen(false)}>
              {tc('close')}
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => setOpen(false)}>
                {tc('cancel')}
              </Button>
              <Button variant="destructive" onClick={confirm} disabled={deleting}>
                {deleting ? tc('deleting') : tc('delete')}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
