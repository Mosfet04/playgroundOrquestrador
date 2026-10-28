'use client'

import type { RefObject } from 'react'
import type { UseFormReturn } from 'react-hook-form'
import { useFormatter, useTranslations } from 'next-intl'
import { Plus } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LiveStatus } from '@/components/ui/loading'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { HeaderProblem } from '@/lib/toolHeaders'
import type { ConfigSchema } from '@/types/management'
import { FieldError } from '../common/FieldError'
import { SectionCard } from '../common/SectionCard'
import { withCurrent } from '../common/useConfigSchema'
import { HeadersGroup } from './HeadersGroup'
import { code } from './richCode'
import type { ToolFormValues } from './toolFormValues'

// Configuração HTTP: método, rota parametrizada e headers. A rota com
// `{param}` sem parâmetro de mesmo nome mostra o erro com a ação que o cria
// (D-P3-03-2); o envio é recusado em ToolForm, o motivo fica visível aqui.
export function HttpSection({
  form,
  schema,
  loadingSchema,
  locked,
  missing,
  spaced,
  created,
  onCreateParams,
  prefixes,
  headerProblems,
  loadedOrigin,
  addHeaderRef
}: {
  form: UseFormReturn<ToolFormValues>
  schema: ConfigSchema | undefined
  // Opções do orquestrador a caminho: método e tipos ficam desabilitados.
  loadingSchema: boolean
  // Sem schema ou store só leitura: o Select precisa de `disabled` próprio.
  locked: boolean
  missing: string[]
  spaced: string[]
  created: string[]
  onCreateParams: (names: string[]) => void
  prefixes: string[]
  headerProblems: HeaderProblem[]
  loadedOrigin: string | null
  addHeaderRef: RefObject<HTMLButtonElement | null>
}) {
  const t = useTranslations('tools.form')
  const format = useFormatter()
  const { register, watch, setValue, formState } = form
  const { errors } = formState
  const httpMethod = watch('http_method')
  const routeError = errors.route?.message
  const routeInvalid = missing.length > 0 || spaced.length > 0 || !!routeError

  return (
    <SectionCard
      id="tool-http"
      title={t('http')}
      description={t('httpDescription')}
      busy={loadingSchema}
      className="min-w-0 xl:col-start-1"
    >
      {loadingSchema && <LiveStatus>{t('schemaLoading')}</LiveStatus>}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="http_method">{t('method')}</Label>
          <Select
            value={httpMethod}
            disabled={locked}
            onValueChange={(value) => setValue('http_method', value)}
          >
            <SelectTrigger id="http_method" className="font-mono">
              <SelectValue placeholder={t('methodPlaceholder')} />
            </SelectTrigger>
            <SelectContent>
              {withCurrent(schema?.httpMethods ?? [], httpMethod).map((method) => (
                <SelectItem key={method} value={method}>
                  {method}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldError message={errors.http_method?.message} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="route">{t('route')}</Label>
          <Input
            id="route"
            className="font-mono"
            autoComplete="off"
            spellCheck={false}
            aria-invalid={routeInvalid ? true : undefined}
            aria-describedby={`route-help${missing.length ? ' route-missing' : ''}${spaced.length ? ' route-spaced' : ''}${routeError ? ' route-error' : ''}`}
            variant={routeInvalid ? 'destructive' : undefined}
            {...register('route', { required: t('routeRequired') })}
            placeholder={t('routePlaceholder')}
          />
          <FieldError id="route-error" message={routeError} />
        </div>
      </div>

      <p id="route-help" className="text-xs text-muted-foreground">
        {t('routeHelp')}
      </p>
      {spaced.length > 0 && (
        <p id="route-spaced" className="text-sm text-destructive">
          {t.rich('routePlaceholderSpaces', {
            names: format.list(
              spaced.map((name) => `{${name}}`),
              { type: 'conjunction' }
            ),
            code
          })}
        </p>
      )}
      {missing.length > 0 && (
        <div className="space-y-2">
          <p id="route-missing" className="text-sm text-destructive">
            {t.rich('routeMissingParams', { names: format.list(missing, { type: 'conjunction' }), code })}
          </p>
          <div className="flex flex-wrap gap-2">
            {missing.map((name) => (
              <Button
                key={name}
                type="button"
                variant="outline"
                size="sm"
                className="h-10 w-full sm:h-8 sm:w-auto"
                onClick={() => onCreateParams([name])}
              >
                <Plus aria-hidden="true" />
                {t.rich('createParam', { name, code })}
              </Button>
            ))}
            {missing.length > 1 && (
              <Button
                type="button"
                size="sm"
                className="h-10 w-full sm:h-8 sm:w-auto"
                onClick={() => onCreateParams(missing)}
              >
                {t('createAllParams', { count: missing.length })}
              </Button>
            )}
          </div>
        </div>
      )}
      <p role="status" className="sr-only">
        {created.length > 0 ? t('paramsCreated', { names: format.list(created, { type: 'conjunction' }) }) : ''}
      </p>

      <HeadersGroup
        form={form}
        prefixes={prefixes}
        locked={locked}
        problems={headerProblems}
        loadedOrigin={loadedOrigin}
        addRef={addHeaderRef}
      />
    </SectionCard>
  )
}
