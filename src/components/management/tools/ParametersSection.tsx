'use client'

import type { RefObject } from 'react'
import type { FieldPath, UseFieldArrayReturn, UseFormReturn } from 'react-hook-form'
import { useTranslations } from 'next-intl'
import { Lock, Plus, Route, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Chip } from '@/components/ui/loading'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { routePlaceholders } from '@/lib/toolRoute'
import type { DefaultKind } from '@/lib/toolDefault'
import type { ConfigSchema } from '@/types/management'
import { FieldError } from '../common/FieldError'
import { SectionCard } from '../common/SectionCard'
import { withCurrent } from '../common/useConfigSchema'
import { InfoNote } from './InfoNote'
import type { ToolFormValues } from './toolFormValues'

const exampleKey = (type: string) =>
  type === 'integer' || type === 'float' || type === 'object' || type === 'array' ? type : 'string'
const NONE = 'none'
const BOOLEANS = ['true', 'false']

export type FocusRequest = FieldPath<ToolFormValues> | 'add-parameter'

// Parâmetros da tool: nome, tipo, obrigatório, descrição e valor padrão
// (D-P3-03-1: texto convertido pelo tipo; o orquestrador só o grava). O
// parâmetro cujo nome está na rota é obrigatório e travado (D-P3-03-2).
export function ParametersSection({
  form,
  list,
  schema,
  locked,
  defaultErrors,
  requestFocus,
  addRef
}: {
  form: UseFormReturn<ToolFormValues>
  list: Pick<UseFieldArrayReturn<ToolFormValues, 'parameters'>, 'fields' | 'append' | 'remove'>
  schema: ConfigSchema | undefined
  // Sem schema ou store só leitura: Select e Switch precisam de `disabled` próprio.
  locked: boolean
  defaultErrors: (DefaultKind | undefined)[]
  requestFocus: (target: FocusRequest) => void
  addRef: RefObject<HTMLButtonElement | null>
}) {
  const t = useTranslations('tools.form')
  const tc = useTranslations('common')
  const { register, watch, setValue, formState } = form
  const { fields, append, remove } = list
  const { errors } = formState
  const rows = watch('parameters')
  const inRoute = routePlaceholders(watch('route'))

  return (
    <SectionCard
      id="tool-parameters"
      title={t('parameters')}
      description={t('parametersDescription')}
      className="min-w-0 xl:col-start-1"
      action={
        <Button
          ref={addRef}
          type="button"
          variant="outline"
          size="sm"
          className="h-10 w-full md:h-8 md:w-auto"
          onClick={() => {
            append({
              name: '',
              type: schema?.parameterTypes[0] ?? 'string',
              description: '',
              required: false,
              default_text: ''
            })
            requestFocus(`parameters.${fields.length}.name`)
          }}
        >
          <Plus aria-hidden="true" />
          {t('addParameter')}
        </Button>
      }
    >
      <InfoNote id="default-note">{t('defaultNote')}</InfoNote>

      {fields.length === 0 ? (
        <p className="rounded-md border bg-muted p-3 text-sm text-muted-foreground">
          {t('noParameters')}
        </p>
      ) : (
        <ul aria-label={t('parameters')} className="space-y-3">
          {fields.map((field, index) => {
            const row = rows[index] ?? { name: '', type: 'string', description: '', required: false, default_text: '' }
            const position = index + 1
            const onRoute = row.name.trim() !== '' && inRoute.includes(row.name.trim())
            const id = (part: string) => `param-${field.id}-${part}`
            const rejected = errors.parameters?.[index]?.message
            const defaultError = defaultErrors[index]
            const nameError = errors.parameters?.[index]?.name?.message
            const descriptionError = errors.parameters?.[index]?.description?.message
            const bool = row.type === 'boolean'
            return (
              <li key={field.id} className="space-y-2 rounded-lg border p-3">
                <div className="grid grid-cols-[minmax(0,1fr)_2.75rem] gap-x-2 gap-y-3 md:grid-cols-[minmax(0,1fr)_9rem_8.5rem_2.25rem] md:items-start">
                  <div className="col-start-1 row-start-1 space-y-2 md:col-auto md:row-auto">
                    <div className="flex min-h-6 items-center justify-between gap-2">
                      <Label htmlFor={id('name')}>{t('parameterName')}</Label>
                      {onRoute && (
                        <Chip className="border-transparent bg-primary-soft text-primary">
                          <Route className="size-3" aria-hidden="true" />
                          <span id={id('route')}>{t('paramOnRoute')}</span>
                        </Chip>
                      )}
                    </div>
                    <Input
                      id={id('name')}
                      className="font-mono md:h-9"
                      autoComplete="off"
                      spellCheck={false}
                      aria-invalid={nameError || rejected ? true : undefined}
                      aria-describedby={
                        [rejected ? id('rejected') : '', nameError ? id('name-error') : '']
                          .filter(Boolean)
                          .join(' ') || undefined
                      }
                      variant={nameError ? 'destructive' : undefined}
                      {...register(`parameters.${index}.name`, { required: tc('nameRequired') })}
                      placeholder={t('parameterNamePlaceholder')}
                    />
                    <FieldError id={id('name-error')} message={nameError} />
                  </div>

                  <div className="col-span-2 space-y-2 md:col-auto">
                    <div className="flex min-h-6 items-center">
                      <Label htmlFor={id('type')}>{t('parameterType')}</Label>
                    </div>
                    <Select
                      value={row.type}
                      disabled={locked}
                      onValueChange={(value) => setValue(`parameters.${index}.type`, value)}
                    >
                      <SelectTrigger id={id('type')} className="h-10 font-mono md:h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {withCurrent(schema?.parameterTypes ?? [], row.type).map((type) => (
                          <SelectItem key={type} value={type}>
                            {type}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="col-span-2 space-y-2 md:col-auto">
                    <div className="flex min-h-6 items-center">
                      <Label htmlFor={id('required')}>{t('parameterRequired')}</Label>
                    </div>
                    <div className="flex h-10 items-center gap-2 md:h-9">
                      <Switch
                        id={id('required')}
                        checked={onRoute || row.required}
                        disabled={locked || onRoute}
                        aria-describedby={onRoute ? `${id('route')} ${id('locked')}` : undefined}
                        onCheckedChange={(checked) =>
                          setValue(`parameters.${index}.required`, checked)
                        }
                      />
                      {onRoute && (
                        <>
                          <Lock className="size-3.5 text-muted-foreground" aria-hidden="true" />
                          <span id={id('locked')} className="sr-only">
                            {t('paramRequiredLocked')}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="col-span-2 space-y-2 md:col-auto">
                    <Label htmlFor={id('description')}>{t('parameterDescription')}</Label>
                    <Input
                      id={id('description')}
                      className="md:h-9"
                      aria-invalid={descriptionError ? true : undefined}
                      aria-describedby={descriptionError ? id('description-error') : undefined}
                      variant={descriptionError ? 'destructive' : undefined}
                      {...register(`parameters.${index}.description`, {
                        required: tc('descriptionRequired')
                      })}
                      placeholder={t('parameterDescriptionPlaceholder')}
                    />
                    <FieldError id={id('description-error')} message={descriptionError} />
                  </div>

                  <div className="col-span-2 space-y-2 md:col-span-3">
                    <Label htmlFor={id('default')}>{t('parameterDefault')}</Label>
                    {bool ? (
                      <Select
                        value={BOOLEANS.includes(row.default_text) ? row.default_text : NONE}
                        disabled={locked}
                        onValueChange={(value) =>
                          setValue(`parameters.${index}.default_text`, value === NONE ? '' : value)
                        }
                      >
                        <SelectTrigger
                          id={id('default')}
                          aria-describedby="default-note"
                          className="h-10 font-mono md:h-9"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE}>{t('defaultNone')}</SelectItem>
                          {BOOLEANS.map((value) => (
                            <SelectItem key={value} value={value} className="font-mono">
                              {value}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        id={id('default')}
                        className="font-mono md:h-9"
                        autoComplete="off"
                        spellCheck={false}
                        aria-invalid={defaultError ? true : undefined}
                        aria-describedby={`default-note${defaultError ? ` ${id('default-error')}` : ''}`}
                        variant={defaultError ? 'destructive' : undefined}
                        {...register(`parameters.${index}.default_text`)}
                        placeholder={t(`defaultPlaceholder.${exampleKey(row.type)}`)}
                      />
                    )}
                    <FieldError
                      id={id('default-error')}
                      message={defaultError ? t(`defaultInvalid.${defaultError}`) : undefined}
                    />
                  </div>

                  <Button
                    type="button"
                    variant="ghost"
                    aria-label={
                      row.name === ''
                        ? t('removeParameterUnnamed', { index: position })
                        : t('removeParameter', { name: row.name })
                    }
                    className="col-start-2 row-start-1 size-11 self-end p-0 text-muted-foreground md:col-start-4 md:row-start-1 md:size-9 md:self-end"
                    onClick={() => {
                      remove(index)
                      requestFocus(
                        index < fields.length - 1
                          ? `parameters.${index}.name`
                          : fields.length > 1
                            ? `parameters.${index - 1}.name`
                            : 'add-parameter'
                      )
                    }}
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                </div>
                <FieldError id={id('rejected')} message={rejected} />
              </li>
            )
          })}
        </ul>
      )}
    </SectionCard>
  )
}
