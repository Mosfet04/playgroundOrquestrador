'use client'

import { useEffect, useRef, useState, type RefObject } from 'react'
import { useFieldArray, type UseFormReturn } from 'react-hook-form'
import { useFormatter, useTranslations } from 'next-intl'
import { Lock, Plus, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Chip } from '@/components/ui/loading'
import { isReference, MASK, type HeaderProblem } from '@/lib/toolHeaders'
import { routeOrigin } from '@/lib/toolRoute'
import { cn } from '@/lib/utils'
import { FieldError } from '../common/FieldError'
import { FieldWarning } from '../common/FieldWarning'
import { InfoNote } from './InfoNote'
import { code } from './richCode'
import type { HeaderFormRow, ToolFormValues } from './toolFormValues'

type Focus = { to: 'name' | 'value' | 'replace'; index: number } | { to: 'add' }

const kindOf = (row: HeaderFormRow, prefixes: string[]) =>
  row.hidden
    ? 'masked'
    : row.value === ''
      ? 'empty'
      : isReference(row.value, prefixes)
        ? 'reference'
        : 'text'

// Headers HTTP (P3-03): linhas nome + valor. Valor `env:`/`file:` é
// referência (como está); `***` é o valor gravado, oculto, mantido até a
// troca; nome sensível com texto novo é recusado (src/lib/toolHeaders). O
// valor em texto não passa de `value` do input: nada o repete na tela.
export function HeadersGroup({
  form,
  prefixes,
  problems,
  loadedOrigin,
  addRef
}: {
  form: UseFormReturn<ToolFormValues>
  prefixes: string[]
  problems: HeaderProblem[]
  // Origem da rota como veio do orquestrador (só ela mantém o `***`).
  loadedOrigin: string | null
  // "Adicionar header": ToolForm o foca quando o 422 recusa os headers sem linhas.
  addRef: RefObject<HTMLButtonElement | null>
}) {
  const t = useTranslations('tools.form')
  const format = useFormatter()
  const { register, watch, setValue, setFocus, control, formState } = form
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

  const messageOf = (problem: HeaderProblem | undefined, name: string) =>
    [
      problem?.name === 'required' ? t('headerNameRequired') : '',
      problem?.name === 'duplicate' ? t('headerDuplicate') : '',
      problem?.value === 'required' ? t('headerValueRequired') : '',
      problem?.value === 'sensitive' ? t('headerSensitive', { name, prefixes: joined }) : ''
    ]
      .filter(Boolean)
      .join(' · ')

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
            append({ name: '', value: '', hidden: false, stored: false })
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
            className="hidden grid-cols-[14rem_minmax(0,1fr)_6rem_2.25rem] gap-2 text-xs font-medium text-muted-foreground md:grid"
          >
            <span>{t('headerName')}</span>
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
              const row = rows[index] ?? { name: '', value: '', hidden: false, stored: false }
              const position = index + 1
              const unnamed = row.name === ''
              const kind = kindOf(row, prefixes)
              const kindId = `header-kind-${field.id}`
              const errorId = `header-error-${field.id}`
              const problem = showProblems ? problems[index] : undefined
              const error = messageOf(problem, row.name)
              const replaced = row.stored && !row.hidden
              const valueLabel = row.hidden
                ? t('headerMaskedAria', { name: row.name })
                : replaced
                  ? t('headerNewValueAria', { name: row.name })
                  : unnamed
                    ? t('headerValueUnnamedAria', { index: position })
                    : t('headerValueAria', { name: row.name })
              return (
                <li
                  key={field.id}
                  className="space-y-1 rounded-lg border p-3 md:rounded-none md:border-0 md:p-0"
                >
                  <div className="grid grid-cols-[minmax(0,1fr)_2.75rem] items-center gap-2 md:grid-cols-[14rem_minmax(0,1fr)_6rem_2.25rem]">
                    <Input
                      {...register(`headers.${index}.name`)}
                      aria-label={t('headerNameAria', { index: position })}
                      aria-describedby={problem?.name ? errorId : undefined}
                      aria-invalid={problem?.name ? true : undefined}
                      variant={problem?.name ? 'destructive' : undefined}
                      autoComplete="off"
                      spellCheck={false}
                      className="col-start-1 row-start-1 font-mono md:col-auto md:row-auto md:h-9"
                    />
                    <div className="col-span-2 row-start-2 flex min-w-0 gap-2 md:col-auto md:row-auto">
                      <Input
                        {...register(`headers.${index}.value`)}
                        readOnly={row.hidden}
                        aria-label={valueLabel}
                        aria-describedby={error ? `${kindId} ${errorId}` : kindId}
                        aria-invalid={problem?.value ? true : undefined}
                        variant={problem?.value ? 'destructive' : undefined}
                        placeholder={replaced ? t('headerNewValuePlaceholder', { prefixes: joined }) : undefined}
                        autoComplete="off"
                        spellCheck={false}
                        className={cn(
                          'min-w-0 flex-1 font-mono md:h-9',
                          row.hidden && 'bg-muted tracking-widest text-muted-foreground'
                        )}
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
                        'col-span-2 row-start-3 justify-self-start md:col-auto md:row-auto md:justify-center md:justify-self-auto',
                        kind === 'empty' && 'text-muted-foreground'
                      )}
                    >
                      {kind === 'masked' && <Lock className="size-3" aria-hidden="true" />}
                      <span id={kindId}>{kind === 'empty' ? '—' : t(`headerKind.${kind}`)}</span>
                    </Chip>
                    <Button
                      type="button"
                      variant="ghost"
                      aria-label={
                        unnamed
                          ? t('removeHeaderUnnamed', { index: position })
                          : t('removeHeader', { name: row.name })
                      }
                      className="col-start-2 row-start-1 size-11 p-0 text-muted-foreground md:col-auto md:row-auto md:size-9"
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
                  </div>
                  <FieldError id={errorId} message={error} />
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
