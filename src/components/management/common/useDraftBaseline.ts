import { useCallback, useEffect, useRef } from 'react'
import type { FieldValues, Path, PathValue, UseFormReturn } from 'react-hook-form'

// Igualdade por valor dos valores do formulário (texto, número, booleano,
// listas e objetos simples). Exata: espaço no fim conta, NaN é igual a NaN.
// `{ k: undefined }` difere de `{}`: os dois lados têm as mesmas chaves, porque
// a base é tirada depois de os campos montados se registrarem (o RHF guarda a
// chave do campo mesmo sem valor) e `setDefault` só troca o valor de uma chave.
function sameValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  const left = a as Record<string, unknown>
  const right = b as Record<string, unknown>
  const keys = Object.keys(left)
  return (
    keys.length === Object.keys(right).length &&
    keys.every((key) => Object.hasOwn(right, key) && sameValue(left[key], right[key]))
  )
}

/**
 * Base do rascunho da criação (D-QA1-06-4): os valores do formulário aberto sem
 * tocar. `changed` compara por valor na hora da saída (o DraftGuard pergunta):
 * digitar e apagar volta a igual, linha adicionada conta. Os efeitos que
 * completam o padrão pelo schema usam `setDefault`, que muda o valor e a base
 * juntos: o padrão do schema não é rascunho, e o que foi digitado antes de o
 * schema chegar continua sendo. Na edição a base é a versão lida (o
 * `hasChanges` do useSaveReview).
 */
export function useDraftBaseline<V extends FieldValues>({
  getValues,
  setValue
}: Pick<UseFormReturn<V>, 'getValues' | 'setValue'>) {
  const baseline = useRef<V | null>(null)
  // Depois do 1º commit: os campos montados já se registraram (o número vazio vale NaN).
  useEffect(() => {
    baseline.current ??= structuredClone(getValues())
  }, [getValues])

  const setDefault = useCallback(
    <K extends keyof V & Path<V>>(name: K, value: PathValue<V, K>) => {
      setValue(name, value)
      if (baseline.current) baseline.current = { ...baseline.current, [name]: value }
    },
    [setValue]
  )

  const changed = useCallback(
    () => baseline.current !== null && !sameValue(getValues(), baseline.current),
    [getValues]
  )

  return { setDefault, changed }
}
