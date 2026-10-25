'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Trash2 } from 'lucide-react'

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

type DeleteTexts = {
  label: string
  title: string
  description: string
  deleted: string
  failed: string
  notFound: string
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
  const requestError = useRequestError()
  const tc = useTranslations('common')
  const deleted = useRef(false)

  // A troca de rota desmonta o editor (e o Dialog com o foco) depois do commit
  // da lista: o foco vai para o h1 dela.
  useEffect(
    () => () => {
      if (deleted.current) focusHeadingIfLost()
    },
    []
  )

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
    } catch (error) {
      console.error('Error deleting:', url, error)
    }
    toast.error(requestError(status, { failed: texts.failed, notFound: texts.notFound }))
    setDeleting(false)
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
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
          <DialogTitle>{texts.title}</DialogTitle>
          <DialogDescription>{texts.description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {tc('cancel')}
          </Button>
          <Button variant="destructive" onClick={confirm} disabled={deleting}>
            {deleting ? tc('deleting') : tc('delete')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
