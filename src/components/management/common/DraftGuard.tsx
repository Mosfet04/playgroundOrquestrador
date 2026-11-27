'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'

import { holdPopState } from '@/components/layout/PopStateGate'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'

const BUTTON = 'h-10 w-full sm:h-9 sm:w-auto'

// A saída que o aviso segura: o elemento clicado (link, "Sair") ou os passos do Voltar/Avançar.
type Exit = { target: HTMLElement } | { steps: number }

// Navigation API (Chromium, Firefox 147+, Safari 26.2+; fora do lib.dom do TS
// 5.7): o índice da entrada diz quantos passos o browser andou. Sem ela não há
// direção (um `history.go` para o lado errado nem dispara popstate): o guard não
// segura o Voltar/Avançar e o router navega (limite aceito na revisão, R2).
type WithNavigation = { navigation?: { currentEntry: { index: number } | null } }
const entryIndex = () => (window as WithNavigation).navigation?.currentEntry?.index

const pageOf = ({ pathname, search }: { pathname: string; search: string }) => pathname + search

// O que tira do formulário na mesma aba: botão principal sem modificador
// (Ctrl/Cmd/Shift/Alt e o botão do meio abrem em outra aba ou janela). Link sem
// `target` nem `download`, para outra página da mesma origem (âncora da própria
// página fica; outra origem passa pelo `beforeunload`); ou um controle marcado
// com `data-leaves-page` (o "Sair" do shell, D-QA1-06-5).
function leavingTarget(event: MouseEvent): HTMLElement | undefined {
  if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return
  const target = event.target instanceof Element ? event.target.closest('a[href], [data-leaves-page]') : null
  if (!(target instanceof HTMLAnchorElement)) return target instanceof HTMLElement ? target : undefined
  if (target.hasAttribute('download') || (target.target && target.target !== '_self')) return
  const url = new URL(target.href)
  return url.origin === location.origin && pageOf(url) !== pageOf(location) ? target : undefined
}

/**
 * Aviso de alteração não salva (QA1-06, #15). O App Router não bloqueia a
 * navegação: o guard a segura antes dele. Links (os do shell, Voltar,
 * Cancelar, "Testar agora") e o "Sair": clique na captura da `window`, antes do React.
 * Voltar/Avançar do browser: popstate pelo PopStateGate (à frente do listener
 * do router), que volta à entrada do formulário. Recarregar, fechar e outra
 * URL: `beforeunload` (diálogo nativo). `hasDraft` é lido na hora da saída
 * (sem custo por tecla); o que o formulário faz por código (redirect depois de
 * salvar) não passa por aqui. `paused`: outro diálogo decide a saída (o do
 * 412, que não empilha com o aviso); o `beforeunload` segue armado.
 */
export function DraftGuard({ hasDraft, paused = false }: { hasDraft: () => boolean; paused?: boolean }) {
  const tc = useTranslations('common')
  const [exit, setExit] = useState<Exit | null>(null)
  const keepRef = useRef<HTMLButtonElement>(null)
  // O elemento que abriu o aviso recebe o foco de volta (o `exit` já é null ao fechar).
  const origin = useRef<HTMLElement | null>(null)
  const draft = useRef(hasDraft)
  const held = useRef(paused)
  // "Descartar e sair" escolhido: a saída segue sem aviso, uma vez só. Se ela não
  // descarrega a página (o logout falhou), a próxima interação rearma o guard.
  const leaving = useRef(false)

  useEffect(() => {
    draft.current = hasDraft
    held.current = paused
  })

  useEffect(() => {
    const page = pageOf(location)
    const start = entryIndex()
    // O history.go de volta à entrada do formulário dispara outro popstate.
    let returning = false

    const blocks = () => !leaving.current && draft.current()
    const holds = () => !held.current && blocks()

    const onClick = (event: MouseEvent) => {
      const target = leavingTarget(event)
      if (!target || !holds()) return
      event.preventDefault()
      event.stopPropagation()
      origin.current = target
      setExit({ target })
    }
    const onPopState = (event: PopStateEvent) => {
      if (returning) {
        returning = false
        event.stopImmediatePropagation()
        return
      }
      const now = entryIndex()
      // Sem índice não há direção; índice igual seria `history.go(0)` (recarregar).
      if (pageOf(location) === page || start === undefined || now === undefined || now === start || !holds())
        return
      event.stopImmediatePropagation()
      const steps = now - start
      returning = true
      history.go(-steps)
      origin.current = null
      setExit({ steps })
    }
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!blocks()) return
      event.preventDefault()
      // Legado (Safari antigo): o diálogo nativo também pede o returnValue.
      event.returnValue = ''
    }

    // Antes do clique: o pointerdown do próximo link já rearma, e o clique é segurado.
    const rearm = () => {
      leaving.current = false
    }

    window.addEventListener('click', onClick, true)
    window.addEventListener('pointerdown', rearm, true)
    window.addEventListener('keydown', rearm, true)
    window.addEventListener('beforeunload', onBeforeUnload)
    const releasePopState = holdPopState(onPopState)
    return () => {
      window.removeEventListener('click', onClick, true)
      window.removeEventListener('pointerdown', rearm, true)
      window.removeEventListener('keydown', rearm, true)
      window.removeEventListener('beforeunload', onBeforeUnload)
      releasePopState()
    }
  }, [])

  const leave = () => {
    if (!exit || leaving.current) return
    leaving.current = true
    setExit(null)
    // O clique de novo passa pelo onClick do elemento (a navegação do <Link> e o
    // fechamento do menu do celular; o logout do "Sair"); o passo, pelo popstate do router.
    if ('target' in exit) exit.target.click()
    else history.go(exit.steps)
  }

  return (
    <Dialog open={exit !== null} onOpenChange={(open) => !open && setExit(null)}>
      <DialogContent
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          keepRef.current?.focus()
        }}
        onCloseAutoFocus={(event) => {
          // O foco volta ao elemento de origem; no popstate (sem elemento), ao que
          // tinha o foco antes (o padrão do Radix).
          if (!origin.current) return
          event.preventDefault()
          origin.current.focus()
        }}
      >
        <DialogHeader>
          <DialogTitle>{tc('draftTitle')}</DialogTitle>
          <div aria-live="polite">
            <DialogDescription>{tc('draftDescription')}</DialogDescription>
          </div>
        </DialogHeader>
        <DialogFooter className="mt-4 flex-col">
          <Button ref={keepRef} variant="outline" className={BUTTON} onClick={() => setExit(null)}>
            {tc('draftKeep')}
          </Button>
          <Button variant="destructive" className={BUTTON} onClick={leave}>
            {tc('draftDiscard')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
