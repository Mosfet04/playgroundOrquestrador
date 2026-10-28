import { useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import type { DiffRow } from '@/lib/formDiff'
import type { EntityControls } from './EntityLoader'

// Estados do diálogo de conflito (P3-06, D-P3-06-1): o salvar levou 412, o
// editor relê a versão atual pelo GET do BFF e compara com o formulário.
export type ConflictState<T> =
  | { status: 'closed' }
  // `again`: o "salvar por cima" levou outro 412 (mudou de novo).
  | { status: 'loading'; again: boolean }
  | { status: 'ready'; current: T; rows: DiffRow[]; again: boolean; saving: boolean }
  | { status: 'error'; code?: number }
  | { status: 'deleted' }

// `saved`: gravou; `conflict`: 412 outra vez; `missing`: 404; `failed`: 422 ou
// erro (o editor já mostrou o erro).
export type OverwriteOutcome = 'saved' | 'conflict' | 'missing' | 'failed'

/**
 * `compare` monta as diferenças do formulário atual com a versão lida;
 * `overwrite` grava o formulário por cima dela (If-Match da versão atual) e
 * recebe `dismiss`, que fecha o diálogo na hora (para o foco do erro de campo
 * não ser puxado de volta); `controls` é do `EntityLoader`: "Recarregar" troca
 * o editor pela versão atual, e se o salvar por cima falha por outro motivo o
 * editor passa a ter a versão atual (documento inteiro, sem remontar), para o
 * próximo envio não sobrescrever o que ele não viu.
 * Devolve `start` (chamar no 412) e as props do `ConflictDialog`.
 */
export function useSaveConflict<T extends { version: number }>({
  url,
  compare,
  overwrite,
  controls
}: {
  url: string
  compare: (current: T) => DiffRow[]
  overwrite: (current: T, dismiss: () => void) => Promise<OverwriteOutcome>
  controls?: EntityControls<T>
}) {
  const tc = useTranslations('common')
  const [state, setState] = useState<ConflictState<T>>({ status: 'closed' })
  // A versão que o usuário estava editando quando o 412 veio.
  const [mine, setMine] = useState(0)
  const generation = useRef(0)

  const fetchCurrent = async (again: boolean) => {
    const run = ++generation.current
    setState({ status: 'loading', again })
    let next: ConflictState<T>
    try {
      const response = await fetch(url)
      const body = response.ok ? await response.json() : null
      if (body?.success) {
        const current = body.data as T
        next = { status: 'ready', current, rows: compare(current), again, saving: false }
      } else next = response.status === 404 ? { status: 'deleted' } : { status: 'error', code: response.status }
    } catch (error) {
      console.error('Error loading current version:', url, error)
      next = { status: 'error' }
    }
    // Fechou (ou recomeçou) no meio: a resposta velha não vale.
    if (run === generation.current) setState(next)
  }

  const start = (version: number) => {
    setMine(version)
    void fetchCurrent(false)
  }

  const close = () => {
    generation.current++
    setState({ status: 'closed' })
  }

  const overwriteCurrent = async () => {
    if (state.status !== 'ready') return
    const { current } = state
    setState({ ...state, saving: true })
    const outcome = await overwrite(current, () => flushSync(close))
    if (outcome === 'conflict') await fetchCurrent(true)
    else if (outcome === 'missing') setState({ status: 'deleted' })
    else {
      if (outcome === 'failed') controls?.set(current)
      close()
    }
  }

  return {
    start,
    dialog: {
      state,
      mine,
      onClose: close,
      onRetry: () => fetchCurrent(false),
      onReload: (current: T) => {
        controls?.replace(current)
        close()
        toast.success(tc('conflictReloaded'))
      },
      onOverwrite: overwriteCurrent
    }
  }
}
