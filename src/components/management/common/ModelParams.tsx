'use client'

import { useEffect, useRef, useState } from 'react'
import type { UseFormReturn } from 'react-hook-form'
import { useFieldArray } from 'react-hook-form'
import { useTranslations } from 'next-intl'
import { Plus, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Chip } from '@/components/ui/loading'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { paramKind } from '@/lib/modelParams'
import type { ProviderOption } from '@/types/management'
import { FieldError } from './FieldError'
import { FieldWarning } from './FieldWarning'
import { withCurrent } from './useConfigSchema'
import type { ParamRow } from './modelFormValues'

// Os dois grupos de parâmetros do editor: o do modelo (agent e team) e o do
// embedder do RAG (P3-05). Mesmos controles, textos e regras; só mudam o campo
// do formulário, o título e o texto de vazio.
export type ParamsField = 'params' | 'rag_params'
export type ParamsForm = Record<ParamsField, ParamRow[]>

const GROUPS = {
  params: { id: 'model-params', title: 'modelParams', empty: 'modelParamsEmpty' },
  rag_params: { id: 'rag-params', title: 'ragModelParams', empty: 'ragParamsEmpty' }
} as const

// Parâmetros do modelo (P3-02): linhas nome + valor. O nome é um dos
// `model_params` do provider escolhido (o gravado que ele não aceita fica, com
// aviso); o valor é texto e o tipo é inferido (D-P3-02-2, src/lib/modelParams).
// `provider` ausente com o schema lido = provider fora das opções: aceita nada.
export function ModelParams({
  form,
  name: fieldName,
  vendor,
  provider,
  schemaReady,
  locked,
  validateRows = true
}: {
  form: UseFormReturn<ParamsForm>
  name: ParamsField
  vendor: string
  provider: ProviderOption | undefined
  schemaReady: boolean
  locked: boolean
  // Linha incompleta só bloqueia quando o grupo vale (RAG desligado: o orquestrador decide).
  validateRows?: boolean
}) {
  const t = useTranslations('agents.form')
  const { register, watch, setValue, getValues, trigger, control, formState } = form
  const group = GROUPS[fieldName]
  const { fields, append, remove } = useFieldArray({ control, name: fieldName })
  const params = watch(fieldName)
  const { errors } = formState

  // Foco depois de adicionar (nome da linha nova) ou remover (linha seguinte,
  // anterior ou "Adicionar"): o elemento só existe depois do render.
  const [focusTarget, setFocusTarget] = useState<number | 'add' | null>(null)
  const nameRefs = useRef<(HTMLButtonElement | null)[]>([])
  const addRef = useRef<HTMLButtonElement | null>(null)
  const titleRef = useRef<HTMLParagraphElement | null>(null)
  useEffect(() => {
    if (focusTarget === null) return
    // "Adicionar" desabilitado (nada mais a oferecer) não recebe foco: vai ao título.
    const add = addRef.current?.disabled ? titleRef.current : addRef.current
    const target = focusTarget === 'add' ? add : nameRefs.current[focusTarget]
    target?.focus()
    setFocusTarget(null)
  }, [focusTarget])

  const accepted = provider?.modelParams ?? []
  const used = new Set(params.map((row) => row.name))
  const free = accepted.filter((name) => !used.has(name))
  const helpKey = !schemaReady
    ? 'modelParamsHelp'
    : accepted.length === 0
      ? 'modelParamsNone'
      : free.length === 0
        ? 'modelParamsAllUsed'
        : 'modelParamsHelp'
  const addDisabled = locked || free.length === 0

  const rowError = (index: number) => {
    const row = getValues(`${fieldName}.${index}`)
    return (
      [
        row.name ? '' : t('modelParamNameRequired'),
        row.value.trim() ? '' : t('modelParamValueRequired')
      ]
        .filter(Boolean)
        .join(' · ') || true
    )
  }

  const groupError = errors.root?.[fieldName]?.message

  return (
    <div
      role="group"
      aria-labelledby={`${group.id}-title`}
      aria-describedby={`${group.id}-help`}
      className="space-y-3 border-t border-border pt-4"
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 space-y-0.5">
          <p
            id={`${group.id}-title`}
            ref={titleRef}
            tabIndex={-1}
            className="text-sm font-medium leading-none focus:outline-none"
          >
            {t(group.title)}
          </p>
          <p id={`${group.id}-help`} className="text-xs text-muted-foreground">
            {t(helpKey, { vendor })}
          </p>
        </div>
        <Button
          ref={addRef}
          type="button"
          variant="outline"
          size="sm"
          className="h-10 w-full md:h-8 md:w-auto"
          disabled={addDisabled}
          aria-describedby={`${group.id}-help`}
          onClick={() => {
            append({ name: '', value: '' })
            setFocusTarget(fields.length)
          }}
        >
          <Plus aria-hidden="true" />
          {t('addModelParam')}
        </Button>
      </div>
      <FieldError id={`${group.id}-error`} message={groupError} />

      {fields.length === 0 ? (
        <p className="rounded-md border bg-muted p-3 text-sm text-muted-foreground">
          {t(group.empty)}
        </p>
      ) : (
        <>
          <div
            aria-hidden="true"
            className="hidden grid-cols-[14rem_minmax(0,1fr)_5rem_2.25rem] gap-2 text-xs font-medium text-muted-foreground md:grid"
          >
            <span>{t('modelParamName')}</span>
            <span>{t('modelParamValue')}</span>
            <span>{t('modelParamType')}</span>
            <span />
          </div>
          <ul
            aria-label={t(group.title)}
            aria-describedby={groupError ? `${group.id}-error` : undefined}
            className="space-y-2"
          >
            {fields.map((field, index) => {
              const row = params[index] ?? { name: '', value: '' }
              const position = index + 1
              const kind = paramKind(row.value)
              const kindId = `param-kind-${field.id}`
              const errorId = `param-error-${field.id}`
              const error = errors[fieldName]?.[index]?.value?.message
              const unnamed = row.name === ''
              return (
                <li
                  key={field.id}
                  className="space-y-1 rounded-lg border p-3 md:rounded-none md:border-0 md:p-0"
                >
                  <div className="grid grid-cols-[minmax(0,1fr)_2.75rem] items-center gap-2 md:grid-cols-[14rem_minmax(0,1fr)_5rem_2.25rem]">
                    <Select
                      value={row.name}
                      disabled={locked}
                      onValueChange={(name) => {
                        setValue(`${fieldName}.${index}.name`, name, { shouldDirty: true })
                        if (errors[fieldName]?.[index]) void trigger(`${fieldName}.${index}.value`)
                      }}
                    >
                      <SelectTrigger
                        ref={(element) => {
                          nameRefs.current[index] = element
                        }}
                        aria-label={t('modelParamNameAria', { index: position })}
                        className="col-start-1 row-start-1 h-10 font-mono md:col-auto md:row-auto md:h-9"
                      >
                        <SelectValue placeholder={t('modelParamNamePlaceholder')} />
                      </SelectTrigger>
                      <SelectContent>
                        {withCurrent(
                          accepted.filter((name) => name === row.name || !used.has(name)),
                          row.name
                        ).map((name) => (
                          <SelectItem key={name} value={name} className="font-mono">
                            {name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      {...register(`${fieldName}.${index}.value`, {
                        validate: () => !validateRows || rowError(index)
                      })}
                      aria-label={
                        unnamed
                          ? t('modelParamValueUnnamedAria', { index: position })
                          : t('modelParamValueAria', { name: row.name })
                      }
                      aria-describedby={error ? `${kindId} ${errorId}` : kindId}
                      aria-invalid={error ? true : undefined}
                      variant={error ? 'destructive' : undefined}
                      autoComplete="off"
                      spellCheck={false}
                      className="col-start-1 row-start-2 font-mono md:col-auto md:row-auto md:h-9"
                    />
                    <Chip
                      className={`col-start-2 row-start-2 justify-center md:col-auto md:row-auto ${
                        kind === 'empty' ? 'text-muted-foreground' : ''
                      }`}
                    >
                      <span id={kindId}>{kind === 'empty' ? '—' : t(`modelParamKind.${kind}`)}</span>
                    </Chip>
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={locked}
                      aria-label={
                        unnamed
                          ? t('removeModelParamUnnamed', { index: position })
                          : t('removeModelParam', { name: row.name })
                      }
                      className="col-start-2 row-start-1 size-11 p-0 text-muted-foreground md:col-auto md:row-auto md:size-9"
                      onClick={() => {
                        remove(index)
                        setFocusTarget(
                          index < fields.length - 1 ? index : fields.length > 1 ? index - 1 : 'add'
                        )
                      }}
                    >
                      <Trash2 aria-hidden="true" />
                    </Button>
                  </div>
                  <FieldError id={errorId} message={error} />
                  {schemaReady && row.name && !accepted.includes(row.name) && (
                    <FieldWarning>
                      {t.rich('modelParamNotAccepted', {
                        vendor,
                        name: row.name,
                        code: (chunks) => <code className="font-mono">{chunks}</code>
                      })}
                    </FieldWarning>
                  )}
                </li>
              )
            })}
          </ul>
        </>
      )}
    </div>
  )
}
