'use client'

import { useEffect, useRef, useState, type Ref, type RefObject } from 'react'
import { Controller, useFieldArray, type UseFormReturn } from 'react-hook-form'
import { useFormatter, useTranslations } from 'next-intl'
import { Lock, Plus, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Chip } from '@/components/ui/loading'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { isReference, joinReference, splitReference } from '@/lib/secretRef'
import { MASK, type HeaderMode, type HeaderProblem } from '@/lib/toolHeaders'
import { routeOrigin } from '@/lib/toolRoute'
import { cn } from '@/lib/utils'
import { FieldError } from '../common/FieldError'
import { FieldWarning } from '../common/FieldWarning'
import {
  AssembledRef,
  SecretRefPair,
  useSecretParts,
  useSecretRefTexts,
  type SecretFocus
} from '../common/SecretRefField'
import { InfoNote } from './InfoNote'
import { code } from './richCode'
import type { HeaderFormRow, ToolFormValues } from './toolFormValues'

type Focus = { to: 'name' | 'value' | 'replace'; index: number } | { to: 'add' }

// A referência montada: só o formato, sem alvo, é vazio.
const referenceOf = (row: HeaderFormRow) =>
  row.mode === 'secret' ? joinReference(splitReference(row.value)) : row.value

const kindOf = (row: HeaderFormRow, prefixes: string[]) =>
  row.hidden
    ? 'masked'
    : referenceOf(row) === ''
      ? 'empty'
      : row.mode === 'secret' || isReference(row.value, prefixes)
        ? 'reference'
        : 'text'

const NEW_ROW: HeaderFormRow = {
  name: '',
  value: '',
  hidden: false,
  stored: false,
  mode: 'text',
  original: ''
}

// Valor de uma linha em modo Segredo: o par do seletor (P3-05).
function SecretValue({
  id,
  value,
  onChange,
  prefixes,
  disabled,
  invalid,
  name,
  describedBy,
  focusRef
}: {
  id: string
  value: string
  onChange: (value: string) => void
  prefixes: string[]
  disabled: boolean
  invalid: boolean
  name: string
  describedBy: string
  focusRef: Ref<SecretFocus>
}) {
  const model = useSecretParts(value, onChange, prefixes)
  return (
    <div className="min-w-0 flex-1">
      <SecretRefPair
        id={id}
        model={model}
        prefixes={prefixes}
        disabled={disabled}
        invalid={invalid}
        describedBy={describedBy}
        nameSuffix={name}
        focusRef={focusRef}
      />
    </div>
  )
}

// Headers HTTP (P3-03): linhas nome + valor. Valor `env:`/`file:` é
// referência (como está); `***` é o valor gravado, oculto, mantido até a
// troca; nome sensível com texto novo é recusado (src/lib/toolHeaders). O
// valor em texto não passa de `value` do input: nada o repete na tela.
export function HeadersGroup({
  form,
  prefixes,
  locked,
  problems,
  loadedOrigin,
  addRef
}: {
  form: UseFormReturn<ToolFormValues>
  prefixes: string[]
  // Sem schema (sem formatos não se monta nem valida referência) ou só leitura:
  // o Select precisa de `disabled` próprio.
  locked: boolean
  problems: HeaderProblem[]
  // Origem da rota como veio do orquestrador (só ela mantém o `***`).
  loadedOrigin: string | null
  // "Adicionar header": ToolForm o foca quando o 422 recusa os headers sem linhas.
  addRef: RefObject<HTMLButtonElement | null>
}) {
  const t = useTranslations('tools.form')
  const format = useFormatter()
  const { register, watch, setValue, setFocus, control, formState } = form
  const texts = useSecretRefTexts(prefixes)
  const { fields, append, remove } = useFieldArray({ control, name: 'headers' })
  const rows = watch('headers')
  const origin = routeOrigin(watch('route'))
  const showProblems = formState.submitCount > 0
  const rejected = formState.errors.root?.headers?.message

  // Foco depois de adicionar, remover, substituir ou manter oculto: o
  // elemento só existe depois do render.
  const [focusTarget, setFocusTarget] = useState<Focus | null>(null)
  const replaceRefs = useRef<(HTMLButtonElement | null)[]>([])
  useEffect(() => {
    if (!focusTarget) return
    if (focusTarget.to === 'add') addRef.current?.focus()
    else if (focusTarget.to === 'replace') replaceRefs.current[focusTarget.index]?.focus()
    else setFocus(`headers.${focusTarget.index}.${focusTarget.to}`)
    setFocusTarget(null)
  }, [focusTarget, setFocus, addRef])

  const hiddenNames = rows.filter((row) => row.hidden && row.name.trim() !== '').map((row) => row.name)
  const originChanged = hiddenNames.length > 0 && loadedOrigin !== null && origin !== loadedOrigin
  const joined = prefixes.join(', ')

  const messageOf = (problem: HeaderProblem | undefined) =>
    [
      problem?.name === 'required' ? t('headerNameRequired') : '',
      problem?.name === 'duplicate' ? t('headerDuplicate') : '',
      problem?.value === 'required' ? t('headerValueRequired') : '',
      problem?.value && problem.value !== 'required' && problem.value !== 'sensitive'
        ? texts.message(problem.value)
        : ''
    ]
      .filter(Boolean)
      .join(' · ')

  // Trocar o modo limpa o valor: texto nunca vira alvo de referência e vice-versa.
  const changeMode = (index: number, next: HeaderMode) => {
    setValue(`headers.${index}.mode`, next)
    setValue(`headers.${index}.value`, '')
  }

  return (
    <div
      role="group"
      aria-labelledby="headers-title"
      aria-describedby="headers-help"
      className="space-y-3 border-t border-border pt-4"
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 space-y-0.5">
          <p id="headers-title" className="text-sm font-medium leading-none">
            {t('headers')}
          </p>
          <p id="headers-help" className="text-xs text-muted-foreground">
            {t.rich('headersHelp', { prefixes: prefixes.join('/'), code })}
          </p>
        </div>
        <Button
          ref={addRef}
          type="button"
          variant="outline"
          size="sm"
          className="h-10 w-full md:h-8 md:w-auto"
          onClick={() => {
            append(NEW_ROW)
            setFocusTarget({ to: 'name', index: fields.length })
          }}
        >
          <Plus aria-hidden="true" />
          {t('addHeader')}
        </Button>
      </div>
      <FieldError id="headers-error" message={rejected ? t('headersRejected') : undefined} />

      {fields.length === 0 ? (
        <p className="rounded-md border bg-muted p-3 text-sm text-muted-foreground">{t('noHeaders')}</p>
      ) : (
        <>
          <div
            aria-hidden="true"
            className="hidden grid-cols-[12rem_7rem_minmax(0,1fr)_6rem_2.25rem] gap-2 text-xs font-medium text-muted-foreground md:grid"
          >
            <span>{t('headerName')}</span>
            <span>{t('headerMode')}</span>
            <span>{t('headerValue')}</span>
            <span>{t('headerState')}</span>
            <span />
          </div>
          <ul
            aria-label={t('headers')}
            aria-describedby={rejected ? 'headers-error' : undefined}
            className="space-y-2"
          >
            {fields.map((field, index) => {
              const row = rows[index] ?? NEW_ROW
              const position = index + 1
              const unnamed = row.name === ''
              const label = unnamed ? t('headerUnnamed', { index: position }) : row.name
              const kind = kindOf(row, prefixes)
              const kindId = `header-kind-${field.id}`
              const errorId = `header-error-${field.id}`
              const sensitiveId = `header-sensitive-${field.id}`
              const outId = `header-out-${field.id}`
              const warningId = `header-warning-${field.id}`
              const problem = showProblems ? problems[index] : undefined
              const error = messageOf(problem)
              const sensitive = problem?.value === 'sensitive'
              const secret = row.mode === 'secret'
              const replaced = row.stored && !row.hidden
              const warning =
                secret && !row.hidden && !problem?.value && row.value === row.original
                  ? texts.warning(row.value)
                  : undefined
              const valueLabel = row.hidden
                ? t('headerMaskedAria', { name: row.name })
                : replaced
                  ? t('headerNewValueAria', { name: row.name })
                  : unnamed
                    ? t('headerValueUnnamedAria', { index: position })
                    : t('headerValueAria', { name: row.name })
              const describedBy = [
                kindId,
                secret ? outId : '',
                error ? errorId : '',
                sensitive ? sensitiveId : '',
                warning ? warningId : ''
              ]
                .filter(Boolean)
                .join(' ')
              return (
                <li
                  key={field.id}
                  className="grid grid-cols-[minmax(0,1fr)_2.75rem] items-center gap-x-2 gap-y-1 rounded-lg border p-3 md:grid-cols-[12rem_7rem_minmax(0,1fr)_6rem_2.25rem] md:rounded-none md:border-0 md:p-0"
                >
                  <Input
                    {...register(`headers.${index}.name`)}
                    aria-label={t('headerNameAria', { index: position })}
                    aria-describedby={problem?.name ? errorId : undefined}
                    aria-invalid={problem?.name ? true : undefined}
                    variant={problem?.name ? 'destructive' : undefined}
                    autoComplete="off"
                    spellCheck={false}
                    className="col-start-1 row-start-1 font-mono md:h-9"
                  />
                  <div className="col-span-2 md:col-span-1">
                    <Select
                      value={row.mode}
                      disabled={locked || row.hidden}
                      onValueChange={(next) => changeMode(index, next === 'secret' ? 'secret' : 'text')}
                    >
                      <SelectTrigger
                        aria-label={t('headerModeAria', { name: label })}
                        className="h-10 md:h-9"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="text">{t('headerModeText')}</SelectItem>
                        <SelectItem value="secret">{t('headerModeSecret')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2 flex min-w-0 gap-2 md:col-span-1">
                    <Controller
                      control={control}
                      name={`headers.${index}.value`}
                      render={({ field: valueField }) =>
                        secret ? (
                          <SecretValue
                            id={`header-secret-${field.id}`}
                            value={valueField.value}
                            onChange={valueField.onChange}
                            prefixes={prefixes}
                            disabled={locked}
                            invalid={!!problem?.value}
                            name={label}
                            describedBy={describedBy}
                            focusRef={valueField.ref}
                          />
                        ) : (
                          <Input
                            ref={valueField.ref}
                            name={valueField.name}
                            value={valueField.value}
                            onBlur={valueField.onBlur}
                            onChange={(event) => {
                              const next = event.target.value
                              // Texto que já é uma referência do schema vira Segredo,
                              // separado em formato e alvo, com o foco no alvo.
                              if (!locked && !row.hidden && isReference(next, prefixes)) {
                                setValue(`headers.${index}.mode`, 'secret')
                                setFocusTarget({ to: 'value', index })
                                // Sem espaço nas pontas do alvo, como o seletor.
                                const { prefix, target } = splitReference(next)
                                valueField.onChange(prefix + target.trim())
                                return
                              }
                              valueField.onChange(next)
                            }}
                            readOnly={row.hidden}
                            aria-label={valueLabel}
                            aria-describedby={describedBy}
                            aria-invalid={problem?.value ? true : undefined}
                            variant={problem?.value ? 'destructive' : undefined}
                            placeholder={
                              replaced ? t('headerNewValuePlaceholder', { prefixes: joined }) : undefined
                            }
                            autoComplete="off"
                            spellCheck={false}
                            className={cn(
                              'min-w-0 flex-1 font-mono md:h-9',
                              row.hidden && 'bg-muted tracking-widest text-muted-foreground'
                            )}
                          />
                        )
                      }
                    />
                    {row.hidden && (
                      <Button
                        ref={(element) => {
                          replaceRefs.current[index] = element
                        }}
                        type="button"
                        variant="outline"
                        aria-label={t('replaceHeaderAria', { name: row.name })}
                        className="h-10 shrink-0 md:h-9"
                        onClick={() => {
                          setValue(`headers.${index}.hidden`, false)
                          setValue(`headers.${index}.value`, '')
                          setFocusTarget({ to: 'value', index })
                        }}
                      >
                        {t('replaceHeader')}
                      </Button>
                    )}
                    {replaced && (
                      <Button
                        type="button"
                        variant="ghost"
                        aria-label={t('keepMaskedAria', { name: row.name })}
                        className="h-10 shrink-0 md:h-9"
                        onClick={() => {
                          setValue(`headers.${index}.hidden`, true)
                          setValue(`headers.${index}.mode`, 'text')
                          setValue(`headers.${index}.value`, MASK)
                          setFocusTarget({ to: 'replace', index })
                        }}
                      >
                        {t('keepMasked')}
                      </Button>
                    )}
                  </div>
                  <Chip
                    className={cn(
                      'col-span-2 justify-self-start md:col-span-1 md:justify-center md:justify-self-auto',
                      kind === 'empty' && 'text-muted-foreground'
                    )}
                  >
                    {kind === 'masked' && <Lock className="size-3" aria-hidden="true" />}
                    <span id={kindId}>{kind === 'empty' ? '—' : t(`headerKind.${kind}`)}</span>
                  </Chip>
                  <div className="col-span-2 space-y-1 md:col-span-5 md:pl-80 empty:hidden">
                    {secret && !row.hidden && <AssembledRef id={outId} value={referenceOf(row)} />}
                    <FieldError id={errorId} message={error} />
                    {sensitive && (
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <FieldError
                          id={sensitiveId}
                          message={t('headerSensitive', { name: row.name, prefixes: joined })}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={locked}
                          aria-label={t('headerUseSecretAria', { name: row.name })}
                          className="h-10 w-full md:h-8 md:w-auto"
                          onClick={() => {
                            setValue(`headers.${index}.mode`, 'secret')
                            setValue(`headers.${index}.value`, '')
                            setFocusTarget({ to: 'value', index })
                          }}
                        >
                          {t('headerUseSecret')}
                        </Button>
                      </div>
                    )}
                    {warning && <FieldWarning id={warningId}>{warning}</FieldWarning>}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    aria-label={
                      unnamed
                        ? t('removeHeaderUnnamed', { index: position })
                        : t('removeHeader', { name: row.name })
                    }
                    className="col-start-2 row-start-1 size-11 p-0 text-muted-foreground md:col-start-5 md:size-9"
                    onClick={() => {
                      remove(index)
                      setFocusTarget(
                        index < fields.length - 1
                          ? { to: 'name', index }
                          : fields.length > 1
                            ? { to: 'name', index: index - 1 }
                            : { to: 'add' }
                      )
                    }}
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                </li>
              )
            })}
          </ul>
        </>
      )}

      {hiddenNames.length > 0 && (
        <InfoNote>
          {t.rich('headersMaskedNote', { origin: origin ?? loadedOrigin ?? '—', code })}
        </InfoNote>
      )}
      {originChanged && (
        <FieldWarning>
          {t.rich('headersOriginChanged', {
            from: loadedOrigin ?? '',
            to: origin ?? '—',
            names: format.list(hiddenNames, { type: 'conjunction' }),
            code
          })}
        </FieldWarning>
      )}
    </div>
  )
}
