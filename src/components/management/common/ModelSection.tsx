'use client'

import { useState } from 'react'
import type { UseFormReturn } from 'react-hook-form'
import { useTranslations } from 'next-intl'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { ConfigSchema } from '@/types/management'
import { FieldError } from './FieldError'
import { FieldWarning } from './FieldWarning'
import { withCurrent } from './useConfigSchema'
import type { ModelFormValues } from './modelFormValues'
import { ModelParams } from './ModelParams'
import { SectionCard } from './SectionCard'

// Map: o provider vem do orquestrador e não pode casar com propriedade de Object.
const MODEL_EXAMPLES = new Map([
  ['ollama', 'llama3.2:latest'],
  ['openai', 'gpt-4']
])

// Seção Modelo (P3-02, reusada pelo team na P3-04): provider, modelo, URL base
// (quando o provider a exige ou há valor) e referência da chave de API (nunca o
// valor), mais os parâmetros do modelo. Os textos que citam a entidade (título,
// descrição, ajuda da referência) são os do namespace dela.
export function ModelSection<T extends ModelFormValues>({
  entity,
  form: entityForm,
  schema,
  locked
}: {
  entity: 'agent' | 'team'
  form: UseFormReturn<T>
  schema: ConfigSchema | undefined
  // Sem schema ou store só leitura: o Select precisa de `disabled` próprio.
  locked: boolean
}) {
  const t = useTranslations('agents.form')
  const te = useTranslations(entity === 'agent' ? 'agents.form' : 'teams.form')
  const tc = useTranslations('common')
  // O formulário da entidade tem estes campos (T estende ModelFormValues); o
  // RHF não aceita o subconjunto como UseFormReturn sem o cast.
  const form = entityForm as unknown as UseFormReturn<ModelFormValues>
  const { register, watch, setValue, formState } = form
  const { errors } = formState
  const factoryIaModel = watch('factoryIaModel')
  const baseUrl = watch('base_url')
  // O usuário já entrou no campo de URL base: ele fica até trocar de provider. Sumir no blur levantaria o "Salvar" entre o
  // mousedown e o click e o clique se perderia.
  const [baseUrlEntered, setBaseUrlEntered] = useState(false)

  const provider = schema?.chatProviders.find(({ name }) => name === factoryIaModel)
  const requiresBaseUrl = provider?.requiresBaseUrl ?? false
  // Trocar de provider não apaga o valor; vazio e sem o provider exigir, o
  // campo recolhe com a troca.
  const showBaseUrl = requiresBaseUrl || !!baseUrl || baseUrlEntered
  const baseUrlNotUsed = !!provider && !requiresBaseUrl && !!baseUrl

  const formats = schema?.apiKeyRefFormats ?? []
  const prefixes = formats.map((format) => format.slice(0, format.indexOf(':') + 1)).filter(Boolean)

  const baseUrlField = register('base_url', {
    validate: (value) =>
      !requiresBaseUrl || !!value?.trim() || t('baseUrlRequired', { vendor: factoryIaModel })
  })
  const apiKeyRefField = register('api_key_ref', {
    validate: (value) => {
      const ref = value?.trim()
      return (
        !ref ||
        prefixes.some((prefix) => ref.startsWith(prefix)) ||
        t('apiKeyRefInvalid', { prefixes: prefixes.join(', ') })
      )
    }
  })

  const baseUrlError = errors.base_url?.message
  const apiKeyRefError = errors.api_key_ref?.message

  return (
    <SectionCard id={`${entity}-model`} title={te('modelSettings')} description={te('modelSettingsDescription')}>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="factoryIaModel">{t('provider')}</Label>
          <Select
            value={factoryIaModel}
            disabled={locked}
            onValueChange={(value) => {
              setValue('factoryIaModel', value)
              setBaseUrlEntered(false)
            }}
          >
            <SelectTrigger id="factoryIaModel">
              <SelectValue placeholder={t('providerPlaceholder')} />
            </SelectTrigger>
            <SelectContent>
              {withCurrent(schema?.chatProviders.map(({ name }) => name) ?? [], factoryIaModel).map(
                (name) => (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                )
              )}
            </SelectContent>
          </Select>
          <FieldError message={errors.factoryIaModel?.message} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="model">{t('model')}</Label>
          <Input
            id="model"
            className="font-mono"
            {...register('model', { required: t('modelRequired') })}
            placeholder={tc('example', {
              value: MODEL_EXAMPLES.get(factoryIaModel) ?? 'claude-3-sonnet'
            })}
          />
          <FieldError message={errors.model?.message} />
        </div>

        {showBaseUrl && (
          <div className="space-y-2">
            <Label htmlFor="base_url">
              {t('baseUrl')}
              {requiresBaseUrl ? ' *' : ''}
            </Label>
            <Input
              id="base_url"
              className="font-mono"
              autoComplete="off"
              spellCheck={false}
              aria-describedby={`base-url-help${baseUrlError ? ' base-url-error' : ''}${baseUrlNotUsed ? ' base-url-warning' : ''}`}
              aria-invalid={baseUrlError ? true : undefined}
              variant={baseUrlError ? 'destructive' : undefined}
              {...baseUrlField}
              onFocus={() => setBaseUrlEntered(true)}
            />
            <p id="base-url-help" className="text-xs text-muted-foreground">
              {t('baseUrlHelp')}
            </p>
            <FieldError id="base-url-error" message={baseUrlError} />
            {baseUrlNotUsed && (
              <FieldWarning id="base-url-warning">
                {t('baseUrlNotUsed', { vendor: factoryIaModel })}
              </FieldWarning>
            )}
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="api_key_ref">{t('apiKeyRef')}</Label>
          <Input
            id="api_key_ref"
            type="text"
            className="font-mono"
            autoComplete="off"
            spellCheck={false}
            aria-describedby={`api-key-ref-help${apiKeyRefError ? ' api-key-ref-error' : ''}`}
            aria-invalid={apiKeyRefError ? true : undefined}
            variant={apiKeyRefError ? 'destructive' : undefined}
            {...apiKeyRefField}
          />
          <p id="api-key-ref-help" className="text-xs text-muted-foreground">
            {formats.length > 0
              ? te.rich('apiKeyRefHelp', {
                  formats: formats.join(' · '),
                  code: (chunks) => <code className="font-mono">{chunks}</code>
                })
              : te('apiKeyRefHelpNoFormats')}
          </p>
          <FieldError id="api-key-ref-error" message={apiKeyRefError} />
        </div>
      </div>

      <ModelParams
        form={form}
        vendor={factoryIaModel}
        provider={provider}
        schemaReady={!!schema}
        locked={locked}
      />
    </SectionCard>
  )
}
