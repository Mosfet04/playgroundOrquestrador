'use client'

import { useState } from 'react'
import { Controller, type UseFormReturn } from 'react-hook-form'
import { useTranslations } from 'next-intl'
import { Info } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LiveStatus } from '@/components/ui/loading'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { referencePrefixes } from '@/lib/secretRef'
import type { ConfigSchema } from '@/types/management'
import { BaseUrlField, type BaseUrlForm } from '../common/BaseUrlField'
import { FieldError } from '../common/FieldError'
import { ModelParams, type ParamsForm } from '../common/ModelParams'
import { SecretRefField, useSecretRefValidate, type SchemaStatus } from '../common/SecretRefField'
import { SectionCard } from '../common/SectionCard'
import { withCurrent } from '../common/useConfigSchema'
import type { AgentFormValues } from './agentFormValues'

// Marca de campo obrigatório no rótulo (o texto vem do catálogo, sem asterisco).
const REQUIRED = ' *'

// Card Configuração RAG (P3-05): o documento inteiro do `rag_config`. Desligar
// não apaga nada: os campos recolhem (seguem no formulário, só ocultos) e o
// BFF grava `active: false` com os valores (D-P3-05-3). "Descartar valores"
// limpa tudo e volta o `rag_config` a `null`.
export function RagSection({
  form,
  schema,
  status,
  writable,
  locked,
  storedApiKeyRef,
  reopened,
  onSettled
}: {
  form: UseFormReturn<AgentFormValues>
  schema: ConfigSchema | undefined
  status: SchemaStatus
  writable: boolean
  // Sem schema ou store só leitura: o Select precisa de `disabled` próprio.
  locked: boolean
  // Referência como foi lida: gravada fora da regra e inalterada não bloqueia.
  storedApiKeyRef: string
  // Desligado, mas com um campo com erro: os campos reaparecem (o erro não
  // pode ficar escondido) até ligar o switch ou descartar.
  reopened: boolean
  onSettled: () => void
}) {
  const t = useTranslations('agents.form')
  const tc = useTranslations('common')
  const { register, control, watch, setValue, setFocus, formState } = form
  const { errors } = formState
  const [discarded, setDiscarded] = useState(false)

  const active = watch('rag_active')
  const docName = watch('rag_doc_name') ?? ''
  const provider = watch('rag_factoryIaModel') ?? ''
  const model = watch('rag_model') ?? ''
  const strategy = watch('rag_search_strategy') ?? ''
  const baseUrl = watch('rag_base_url') ?? ''
  const apiKeyRef = watch('rag_api_key_ref') ?? ''
  const params = watch('rag_params')

  const embedder = schema?.embedderProviders.find(({ name }) => name === provider)
  const prefixes = referencePrefixes(schema?.apiKeyRefFormats ?? [])
  const validateApiKeyRef = useSecretRefValidate(prefixes, storedApiKeyRef)
  const hasValues = !!(docName || model || baseUrl || apiKeyRef || params.length > 0)
  const open = active || reopened

  // Só exigido com o RAG ligado; desligado, o orquestrador decide (D-P3-05-3).
  const required = (message: string) => (value: string | undefined) =>
    !active || !!value?.trim() || message

  const summary = [
    docName,
    model ? `${provider}/${model}` : '',
    strategy
  ]
    .filter(Boolean)
    .join(' · ')

  const discard = () => {
    setValue('rag_doc_name', '')
    setValue('rag_model', '')
    setValue('rag_base_url', '')
    setValue('rag_api_key_ref', '')
    setValue('rag_params', [])
    setValue('rag_search_strategy', schema?.ragSearchStrategies[0] ?? '')
    setValue('rag_factoryIaModel', schema?.embedderProviders[0]?.name ?? 'openai')
    setDiscarded(true)
    onSettled()
    setFocus('rag_active')
  }

  return (
    <SectionCard
      id="agent-rag"
      title={t('rag')}
      description={t('ragDescription')}
      busy={status === 'loading'}
    >
      <div className="space-y-2">
        <div className="flex items-start gap-3">
          <Controller
            control={control}
            name="rag_active"
            render={({ field }) => (
              <Switch
                id="rag_active"
                ref={field.ref}
                checked={field.value}
                aria-describedby="rag-enable-help"
                disabled={!writable}
                onCheckedChange={(checked) => {
                  field.onChange(checked)
                  setDiscarded(false)
                  if (checked) onSettled()
                }}
              />
            )}
          />
          <div className="space-y-0.5">
            <Label htmlFor="rag_active">{t('ragEnable')}</Label>
            <p id="rag-enable-help" className="text-xs text-muted-foreground">
              {t('ragEnableHelp')}
            </p>
          </div>
        </div>
        <FieldError message={errors.rag_active?.message} />
      </div>

      <p role="status" className="sr-only">
        {discarded ? t('ragDiscarded') : ''}
      </p>
      {status === 'loading' && <LiveStatus>{tc('optionsLoading')}</LiveStatus>}
      {status === 'error' && <p className="text-xs text-muted-foreground">{t('ragUnavailable')}</p>}

      {!open &&
        (hasValues ? (
          <div className="flex flex-wrap items-start justify-between gap-3 rounded-md border bg-muted p-3 text-sm">
            <p className="flex min-w-0 flex-1 basis-60 items-start gap-2 text-muted-foreground">
              <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              <span>
                {summary
                  ? t.rich('ragOffKept', {
                      summary,
                      code: (chunks) => <code className="font-mono text-xs text-foreground">{chunks}</code>
                    })
                  : t('ragOffEmpty')}
              </span>
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-10 w-full md:h-8 md:w-auto"
              onClick={discard}
            >
              {t('ragDiscard')}
            </Button>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">{t('ragOffEmpty')}</p>
        ))}

      {(open || hasValues) && (
      <div hidden={!open} className="space-y-4">
        {!active && reopened && (
          <p className="flex items-start gap-1 text-xs text-muted-foreground">
            <Info className="mt-px size-3.5 shrink-0" aria-hidden="true" />
            <span>{t('ragReopened')}</span>
          </p>
        )}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="rag_doc_name">{t('ragDocName')}{REQUIRED}</Label>
            <Input
              id="rag_doc_name"
              className="font-mono"
              autoComplete="off"
              spellCheck={false}
              aria-invalid={errors.rag_doc_name ? true : undefined}
              variant={errors.rag_doc_name ? 'destructive' : undefined}
              {...register('rag_doc_name', { validate: required(t('ragDocNameRequired')) })}
              placeholder={tc('example', { value: 'knowledge_base' })}
            />
            <FieldError message={errors.rag_doc_name?.message} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="rag_search_strategy">{t('ragStrategy')}{REQUIRED}</Label>
            <Controller
              control={control}
              name="rag_search_strategy"
              rules={{ validate: required(t('ragStrategyRequired')) }}
              render={({ field }) => (
                <Select value={field.value ?? ''} disabled={locked} onValueChange={field.onChange}>
                  <SelectTrigger
                    ref={field.ref}
                    id="rag_search_strategy"
                    aria-invalid={errors.rag_search_strategy ? true : undefined}
                    className={errors.rag_search_strategy ? 'border-destructive font-mono' : 'font-mono'}
                  >
                    <SelectValue placeholder={t('ragStrategyPlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    {withCurrent(schema?.ragSearchStrategies ?? [], field.value).map((option) => (
                      <SelectItem key={option} value={option} className="font-mono">
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            <FieldError message={errors.rag_search_strategy?.message} />
          </div>
        </div>

        <div role="group" aria-labelledby="rag-embedder-title" className="space-y-4 border-t border-border pt-4">
          <div className="space-y-0.5">
            <p id="rag-embedder-title" className="text-sm font-medium leading-none">
              {t('ragEmbedder')}
            </p>
            <p className="text-xs text-muted-foreground">{t('ragEmbedderHelp')}</p>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="rag_factoryIaModel">{t('ragProvider')}{REQUIRED}</Label>
              <Controller
                control={control}
                name="rag_factoryIaModel"
                rules={{ validate: required(t('ragProviderRequired')) }}
                render={({ field }) => (
                  <Select value={field.value ?? ''} disabled={locked} onValueChange={field.onChange}>
                    <SelectTrigger
                      ref={field.ref}
                      id="rag_factoryIaModel"
                      aria-invalid={errors.rag_factoryIaModel ? true : undefined}
                      className={errors.rag_factoryIaModel ? 'border-destructive' : undefined}
                    >
                      <SelectValue placeholder={t('providerPlaceholder')} />
                    </SelectTrigger>
                    <SelectContent>
                      {withCurrent(
                        schema?.embedderProviders.map(({ name }) => name) ?? [],
                        field.value
                      ).map((name) => (
                        <SelectItem key={name} value={name}>
                          {name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <FieldError message={errors.rag_factoryIaModel?.message} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="rag_model">{t('ragModel')}{REQUIRED}</Label>
              <Input
                id="rag_model"
                className="font-mono"
                autoComplete="off"
                spellCheck={false}
                aria-invalid={errors.rag_model ? true : undefined}
                variant={errors.rag_model ? 'destructive' : undefined}
                {...register('rag_model', { validate: required(t('ragModelRequired')) })}
                placeholder={tc('example', { value: 'text-embedding-3-small' })}
              />
              <FieldError message={errors.rag_model?.message} />
            </div>

            <BaseUrlField
              form={form as unknown as UseFormReturn<BaseUrlForm>}
              name="rag_base_url"
              vendor={provider}
              provider={embedder}
              mustFill={active}
              className="space-y-2 md:col-span-2"
            />

            <Controller
              control={control}
              name="rag_api_key_ref"
              rules={{ validate: validateApiKeyRef }}
              render={({ field }) => (
                <SecretRefField
                  id="rag_api_key_ref"
                  label={t('ragApiKeyRef')}
                  emptyHelp={t('ragEmptyKey')}
                  value={field.value ?? ''}
                  original={storedApiKeyRef}
                  onChange={field.onChange}
                  prefixes={prefixes}
                  status={status}
                  locked={locked}
                  error={errors.rag_api_key_ref?.message}
                  focusRef={field.ref}
                  className="md:col-span-2"
                />
              )}
            />
          </div>

          <ModelParams
            form={form as unknown as UseFormReturn<ParamsForm>}
            name="rag_params"
            vendor={provider}
            provider={embedder}
            schemaReady={!!schema}
            locked={locked}
            validateRows={active}
          />
        </div>
      </div>
      )}
    </SectionCard>
  )
}
