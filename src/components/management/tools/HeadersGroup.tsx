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
import { isSensitiveHeader, MASK, type HeaderMode, type HeaderProblem } from '@/lib/toolHeaders'
import { routeOrigin } from '@/lib/toolRoute'
import { cn } from '@/lib/utils'
import { errorA11y, FieldError } from '../common/FieldError'
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

// Slot do erro do grupo (422 `headers`): o ToolForm rola até ele.
export const HEADERS_ERROR_ID = 'headers-error'

// Estado de tela de cada linha, fora do documento (pelo id do useFieldArray).
// O erro do valor só aparece se ele perdeu o foco (`touched`) ou se houve um
// Salvar depois da última troca de modo (`submits`: os envios até ela) (QA1-07
// §4). `auto`: a troca automática para Segredo, uma vez por linha, com o aviso
// até a próxima troca manual (D-QA1-07-2).
type RowView = { touched: boolean; submits: number; auto: 'none' | 'notice' | 'done' }
const FRESH_VIEW: RowView = { touched: false, submits: 0, auto: 'none' }

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
  focusRef,
  onBlur
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
  onBlur: () => void
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
        onBlur={onBlur}
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
  const { register, watch, setValue, setFocus, clearErrors, control, formState } = form
  const texts = useSecretRefTexts(prefixes)
  const { fields, append, remove } = useFieldArray({ control, name: 'headers' })
  const rows = watch('headers')
  const origin = routeOrigin(watch('route'))
  const { submitCount } = formState
  const rejected = formState.errors.root?.headers?.message

  // O 422 não diz qual header: o erro do grupo sai na 1ª edição de um deles.
  useEffect(() => {
    if (!rejected) return
    const subscription = watch((_, { name }) => {
      if (name?.startsWith('headers')) clearErrors('root.headers')
    })
    return () => subscription.unsubscribe()
  }, [rejected, watch, clearErrors])

  const [views, setViews] = useState<Record<string, RowView>>({})
  const viewOf = (id: string) => views[id] ?? FRESH_VIEW
  const updateView = (id: string, patch: Partial<RowView>) =>
    setViews((current) => ({ ...current, [id]: { ...(current[id] ?? FRESH_VIEW), ...patch } }))
  const touch = (id: string) => {
    if (!viewOf(id).touched) updateView(id, { touched: true })
  }
  // Toda troca de modo esconde o erro do valor até tocar ou salvar de novo (com
  // um envio em curso, ele já conta: o `submitCount` só sobe no fim).
  const modeChanged = (id: string, auto: RowView['auto']) =>
    updateView(id, { touched: false, submits: submitCount + (formState.isSubmitting ? 1 : 0), auto })

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
  // A troca manual encerra o aviso da automática, que não volta.
  const changeMode = (index: number, id: string, next: HeaderMode) => {
    setValue(`headers.${index}.mode`, next)
    setValue(`headers.${index}.value`, '')
    const { auto } = viewOf(id)
    modeChanged(id, auto === 'notice' ? 'done' : auto)
  }

  // Nome que acaba de virar sensível numa linha em Texto, visível e vazia: a
  // linha passa a Segredo sozinha, uma vez (D-QA1-07-2). O foco fica no nome.
  const switchIfSensitive = (index: number, id: string, row: HeaderFormRow, name: string) => {
    const eligible =
      !locked && !row.hidden && row.mode === 'text' && row.value === '' && viewOf(id).auto === 'none'
    if (!eligible || isSensitiveHeader(row.name) || !isSensitiveHeader(name)) return
    setValue(`headers.${index}.mode`, 'secret')
    modeChanged(id, 'notice')
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
            {t.rich('headersHelp', {
              prefixes: prefixes.join('/'),
              secretHost: t('headersSecretHost'),
              code
            })}
          </p>
        </div>
        <Button
          ref={addRef}
          type="button"
          variant="outline"
          size="sm"
          className="h-10 w-full md:h-9 md:w-auto"
          onClick={() => {
            append(NEW_ROW)
            setFocusTarget({ to: 'name', index: fields.length })
          }}
        >
          <Plus aria-hidden="true" />
          {t('addHeader')}
        </Button>
      </div>
      <FieldError id={HEADERS_ERROR_ID} message={rejected ? t('headersRejected') : undefined} />

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
            aria-describedby={rejected ? HEADERS_ERROR_ID : undefined}
            className="space-y-2"
          >
            {fields.map((field, index) => {
              const row = rows[index] ?? NEW_ROW
              const position = index + 1
              const unnamed = row.name === ''
              const label = unnamed ? t('headerUnnamed', { index: position }) : row.name
              const kind = kindOf(row, prefixes)
              const nameField = register(`headers.${index}.name`)
              const kindId = `header-kind-${field.id}`
              const fieldId = `header-${field.id}`
              const errorId = `${fieldId}-error`
              const sensitiveId = `header-sensitive-${field.id}`
              const outId = `header-out-${field.id}`
              const warningId = `header-warning-${field.id}`
              const noticeId = `header-auto-${field.id}`
              const view = viewOf(field.id)
              const problem: HeaderProblem = {
                name: submitCount > 0 ? problems[index]?.name : undefined,
                value: view.touched || submitCount > view.submits ? problems[index]?.value : undefined
              }
              const error = messageOf(problem)
              const sensitive = problem.value === 'sensitive'
              const secret = row.mode === 'secret'
              const replaced = row.stored && !row.hidden
              const notice = view.auto === 'notice' && secret && isSensitiveHeader(row.name)
              const warning =
                secret && !row.hidden && !problem.value && row.value === row.original
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
                notice ? noticeId : '',
                sensitive ? sensitiveId : '',
                warning ? warningId : '',
                errorId
              ]
                .filter(Boolean)
                .join(' ')
              return (
                <li
                  key={field.id}
                  className="grid grid-cols-[minmax(0,1fr)_2.75rem] items-center gap-x-2 gap-y-1 rounded-lg border p-3 md:grid-cols-[12rem_7rem_minmax(0,1fr)_6rem_2.25rem] md:rounded-none md:border-0 md:p-0"
                >
                  <Input
                    {...nameField}
                    onChange={(event) => {
                      // Antes do onChange: `row` é o objeto vivo do formulário.
                      switchIfSensitive(index, field.id, row, event.target.value)
                      void nameField.onChange(event)
                    }}
                    aria-label={t('headerNameAria', { index: position })}
                    {...errorA11y(fieldId, !!problem.name)}
                    autoComplete="off"
                    spellCheck={false}
                    className="col-start-1 row-start-1 font-mono"
                  />
                  <div className="col-span-2 md:col-span-1">
                    <Select
                      value={row.mode}
                      disabled={locked || row.hidden}
                      onValueChange={(next) =>
                        changeMode(index, field.id, next === 'secret' ? 'secret' : 'text')
                      }
                    >
                      <SelectTrigger aria-label={t('headerModeAria', { name: label })}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="text">{t('headerModeText')}</SelectItem>
                        <SelectItem value="secret">{t('headerModeSecret')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {/* Segredo do md em diante (D-QA1-07-3): o par formato + alvo
                      numa 2ª linha, na largura toda, para o alvo caber. */}
                  <div
                    className={cn(
                      'col-span-2 flex min-w-0 gap-2',
                      secret ? 'md:col-span-5 md:col-start-1 md:row-start-2' : 'md:col-span-1'
                    )}
                  >
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
                            invalid={!!problem.value}
                            name={label}
                            describedBy={describedBy}
                            focusRef={valueField.ref}
                            onBlur={() => touch(field.id)}
                          />
                        ) : (
                          <Input
                            ref={valueField.ref}
                            name={valueField.name}
                            value={valueField.value}
                            onBlur={() => {
                              valueField.onBlur()
                              touch(field.id)
                            }}
                            onChange={(event) => {
                              const next = event.target.value
                              // Texto que já é uma referência do schema vira Segredo,
                              // separado em formato e alvo, com o foco no alvo.
                              if (!locked && !row.hidden && isReference(next, prefixes)) {
                                setValue(`headers.${index}.mode`, 'secret')
                                modeChanged(field.id, view.auto)
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
                            aria-invalid={problem.value ? true : undefined}
                            placeholder={
                              replaced ? t('headerNewValuePlaceholder', { prefixes: joined }) : undefined
                            }
                            autoComplete="off"
                            spellCheck={false}
                            className={cn(
                              'min-w-0 flex-1 font-mono',
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
                      'col-span-2 justify-self-start md:col-span-1 md:col-start-4 md:row-start-1 md:justify-center md:justify-self-auto',
                      kind === 'empty' && 'text-muted-foreground'
                    )}
                  >
                    {kind === 'masked' && <Lock className="size-3" aria-hidden="true" />}
                    <span id={kindId}>{kind === 'empty' ? '—' : t(`headerKind.${kind}`)}</span>
                  </Chip>
                  <div className={cn('col-span-2 space-y-1 md:col-span-5', secret ? 'md:pl-0' : 'md:pl-80')}>
                    {secret && !row.hidden && <AssembledRef id={outId} value={referenceOf(row)} />}
                    {/* Região viva sempre montada (fora dela a referência montada,
                        que muda a cada tecla): anuncia o aviso da troca e o erro. */}
                    <div aria-live="polite" className="space-y-1">
                      {notice && (
                        <FieldWarning id={noticeId}>{t('headerAutoSecret', { name: row.name })}</FieldWarning>
                      )}
                      <FieldError id={errorId} message={error} />
                    </div>
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
                            changeMode(index, field.id, 'secret')
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
