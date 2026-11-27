import { act, renderHook } from '@testing-library/react'
import { useFieldArray, useForm } from 'react-hook-form'
import { describe, expect, it } from 'vitest'

import { useDraftBaseline } from '@/components/management/common/useDraftBaseline'

// D-QA1-06-4: na criação, rascunho = valores diferentes dos do formulário
// aberto sem tocar, por valor. O padrão que o schema completa não conta.

type Values = { nome: string; markdown?: boolean; rows: { name: string; value: string }[] }

function useNewForm() {
  const form = useForm<Values>({ defaultValues: { nome: '', markdown: undefined, rows: [] } })
  const rows = useFieldArray({ control: form.control, name: 'rows' })
  return { form, rows, draft: useDraftBaseline(form) }
}

describe('useDraftBaseline', () => {
  it('intocado não é rascunho; digitar é; apagar até o valor inicial volta a não ser', () => {
    const { result } = renderHook(useNewForm)
    expect(result.current.draft.changed()).toBe(false)

    act(() => result.current.form.setValue('nome', 'Novo'))
    expect(result.current.draft.changed()).toBe(true)

    act(() => result.current.form.setValue('nome', ''))
    expect(result.current.draft.changed()).toBe(false)
  })

  it('espaço no fim conta (comparação exata)', () => {
    const { result } = renderHook(useNewForm)
    act(() => result.current.form.setValue('nome', ' '))
    expect(result.current.draft.changed()).toBe(true)
  })

  it('o padrão do schema (setDefault) não é rascunho; mudar depois dele é', () => {
    const { result } = renderHook(useNewForm)

    act(() => result.current.draft.setDefault('markdown', true))
    expect(result.current.form.getValues('markdown')).toBe(true)
    expect(result.current.draft.changed()).toBe(false)

    act(() => result.current.form.setValue('markdown', false))
    expect(result.current.draft.changed()).toBe(true)
    act(() => result.current.form.setValue('markdown', true))
    expect(result.current.draft.changed()).toBe(false)
  })

  it('o digitado antes do schema segue rascunho depois do setDefault', () => {
    const { result } = renderHook(useNewForm)
    act(() => result.current.form.setValue('nome', 'Novo'))

    act(() => result.current.draft.setDefault('markdown', true))

    expect(result.current.draft.changed()).toBe(true)
  })

  it('linha adicionada (mesmo vazia) conta; removida, deixa de contar', () => {
    const { result } = renderHook(useNewForm)

    act(() => result.current.rows.append({ name: '', value: '' }))
    expect(result.current.draft.changed()).toBe(true)

    act(() => result.current.form.setValue('rows.0.value', '0,7'))
    expect(result.current.draft.changed()).toBe(true)

    act(() => result.current.rows.remove(0))
    expect(result.current.draft.changed()).toBe(false)
  })
})
