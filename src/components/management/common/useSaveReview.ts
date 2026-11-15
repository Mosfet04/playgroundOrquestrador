import { useEffect, useId, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import type { FieldValues, UseFormReturn } from 'react-hook-form'

import type { DiffRow } from '@/lib/formDiff'

/**
 * Revisão antes de salvar uma edição (P4-02). `hasChanges` segue o formulário
 * por uma assinatura do `watch`: custa o `compare` por tecla, mas só re-renderiza
 * quando o booleano vira (§6). `compare` precisa ser estável (`useCallback`): ele
 * muda quando muda o que fica fora do formulário (schema, tools do agent).
 * `open` guarda as linhas e o `data` validado juntos: o que foi listado é o que
 * `save` envia, sem reler o formulário. `dismiss` fecha na hora (o foco do erro
 * de campo não pode ser puxado de volta).
 */
export function useSaveReview<V extends FieldValues, T extends { version: number }>({
  form: { watch, clearErrors },
  entity,
  compare,
  save
}: {
  form: Pick<UseFormReturn<V>, 'watch' | 'clearErrors'>
  /** A versão lida; sem ela (criação) não há o que comparar. */
  entity?: T | null
  compare: (read: T, values?: V) => DiffRow[]
  save: (data: V, dismiss: () => void) => Promise<void>
}) {
  const [hasChanges, setHasChanges] = useState(false)
  const [review, setReview] = useState<{ rows: DiffRow[]; version: number; data: V } | null>(null)
  const hintId = useId()

  useEffect(() => {
    if (!entity) return
    const check = () => setHasChanges(compare(entity).length > 0)
    check()
    const subscription = watch(check)
    return () => subscription.unsubscribe()
  }, [watch, entity, compare])

  // Edição desfeita: não há o que salvar, e o erro do último envio ficaria junto da
  // dica. O de `root` (grupo de parâmetros, headers) e o de campo alterado por
  // `setValue` (Select) não saem por revalidação. Só na virada: o erro que surge
  // sem mudança (tool com valor padrão inválido, Salvar ativo) é da validação do clique.
  const wasChanged = useRef(false)
  useEffect(() => {
    if (wasChanged.current && !hasChanges) clearErrors()
    wasChanged.current = hasChanges
  }, [hasChanges, clearErrors])

  const close = () => setReview(null)

  return {
    hasChanges,
    hintId,
    open: (read: T, data: V) => setReview({ rows: compare(read, data), version: read.version, data }),
    dialog: review && {
      rows: review.rows,
      version: review.version,
      onClose: close,
      onConfirm: async () => {
        await save(review.data, () => flushSync(close))
        close()
      }
    }
  }
}
