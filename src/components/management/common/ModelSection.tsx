'use client'

import { Controller, type UseFormReturn } from 'react-hook-form'
import { useTranslations } from 'next-intl'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ProviderSelectItem } from '@/components/management/common/ProviderModel'
import { Select, SelectContent, SelectTrigger, SelectValue } from '@/components/ui/select'
import { referencePrefixes } from '@/lib/secretRef'
import type { ConfigSchema } from '@/types/management'
import { BaseUrlField, type BaseUrlForm } from './BaseUrlField'
import { errorA11y, FieldError } from './FieldError'
import { withCurrent } from './useConfigSchema'
import type { ModelFormValues } from './modelFormValues'
import { ModelParams, type ParamsForm } from './ModelParams'
import { SectionCard } from './SectionCard'
import { SecretRefField, useSecretRefValidate, type SchemaStatus } from './SecretRefField'

// Map: o provider vem do orquestrador e não pode casar com propriedade de Object.
const MODEL_EXAMPLES = new Map([
  ['ollama', 'llama3.2:latest'],
  ['openai', 'gpt-4']
])

// Seção Modelo (P3-02, reusada pelo team na P3-04): provider, modelo, URL base
// (quando o provider a exige ou há valor) e referência da chave de API pelo
// seletor de segredo (P3-05, nunca o valor), mais os parâmetros do modelo. Os
// textos que citam a entidade (título, descrição, "Vazio: …") são os do
// namespace dela.
export function ModelSection<T extends ModelFormValues>({
  entity,
  form: entityForm,
  schema,
  status,
  storedApiKeyRef,
  locked
}: {
  entity: 'agent' | 'team'
  form: UseFormReturn<T>
  schema: ConfigSchema | undefined
  status: SchemaStatus
  // Referência como foi lida: gravada fora da regra e inalterada não bloqueia.
  storedApiKeyRef: string
  // Sem schema ou store só leitura: o Select precisa de `disabled` próprio.
  locked: boolean
}) {
  const t = useTranslations('agents.form')
  const te = useTranslations(entity === 'agent' ? 'agents.form' : 'teams.form')
  const tc = useTranslations('common')
  // O formulário da entidade tem estes campos (T estende ModelFormValues); o
  // RHF não aceita o subconjunto como UseFormReturn sem o cast.
  const form = entityForm as unknown as UseFormReturn<ModelFormValues>
  const { register, watch, setValue, control, formState } = form
  const { errors } = formState
  const factoryIaModel = watch('factoryIaModel')

  const provider = schema?.chatProviders.find(({ name }) => name === factoryIaModel)
  const prefixes = referencePrefixes(schema?.apiKeyRefFormats ?? [])
  const validateApiKeyRef = useSecretRefValidate(prefixes, storedApiKeyRef)

  return (
    <SectionCard id={`${entity}-model`} title={te('modelSettings')} description={te('modelSettingsDescription')}>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="factoryIaModel">{t('provider')}</Label>
          <Select
            value={factoryIaModel}
            disabled={locked}
            onValueChange={(value) => setValue('factoryIaModel', value)}
          >
            <SelectTrigger id="factoryIaModel" {...errorA11y('factoryIaModel', !!errors.factoryIaModel)}>
              <SelectValue placeholder={t('providerPlaceholder')} />
            </SelectTrigger>
            <SelectContent>
              {withCurrent(schema?.chatProviders.map(({ name }) => name) ?? [], factoryIaModel).map(
                (name) => <ProviderSelectItem key={name} name={name} />
              )}
            </SelectContent>
          </Select>
          <FieldError id="factoryIaModel-error" message={errors.factoryIaModel?.message} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="model">{t('model')}</Label>
          <Input
            id="model"
            className="font-mono"
            {...register('model', { required: t('modelRequired') })}
            {...errorA11y('model', !!errors.model)}
            placeholder={tc('example', {
              value: MODEL_EXAMPLES.get(factoryIaModel) ?? 'claude-3-sonnet'
            })}
          />
          <FieldError id="model-error" message={errors.model?.message} />
        </div>

        <BaseUrlField
          form={form as unknown as UseFormReturn<BaseUrlForm>}
          name="base_url"
          vendor={factoryIaModel}
          provider={provider}
          className="space-y-2 md:col-span-2"
        />

        <Controller
          control={control}
          name="api_key_ref"
          rules={{ validate: validateApiKeyRef }}
          render={({ field }) => (
            <SecretRefField
              id="api_key_ref"
              label={t('apiKeyRef')}
              emptyHelp={te('apiKeyRefEmpty')}
              value={field.value ?? ''}
              original={storedApiKeyRef}
              onChange={field.onChange}
              prefixes={prefixes}
              status={status}
              locked={locked}
              error={errors.api_key_ref?.message}
              focusRef={field.ref}
              className="md:col-span-2"
            />
          )}
        />
      </div>

      <ModelParams
        form={form as unknown as UseFormReturn<ParamsForm>}
        name="params"
        vendor={factoryIaModel}
        provider={provider}
        schemaReady={!!schema}
        locked={locked}
      />
    </SectionCard>
  )
}
