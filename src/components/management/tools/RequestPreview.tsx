'use client'

import type { UseFormReturn } from 'react-hook-form'
import { useTranslations } from 'next-intl'

import { buildRequest, type Part } from '@/lib/toolRequest'
import { SectionCard } from '../common/SectionCard'
import type { ToolFormValues } from './toolFormValues'

const EQUALS = '='
const OPEN = '{'
const CLOSE = '}'
const MASKED_TEXT = '••••••'
const BOX = 'rounded-md border bg-muted p-3 font-mono text-xs whitespace-pre-wrap [overflow-wrap:anywhere]'
const LABEL = 'mb-1 font-mono text-xs font-medium uppercase tracking-widest text-muted-foreground'

// Parte do preview: o valor padrão realçado; sem padrão, o placeholder
// tracejado (mantém as chaves, para não depender só da cor).
function PartView({ part }: { part: Part }) {
  if (part.mark === 'default')
    return <span className="rounded-sm bg-primary-soft px-0.5">{part.text}</span>
  if (part.mark === 'placeholder')
    return (
      <span className="rounded-sm border border-dashed border-input px-0.5 text-muted-foreground">
        {part.text}
      </span>
    )
  return <>{part.text}</>
}

// Requisição que o orquestrador monta com o que está no formulário (P3-03),
// sem chamar a rota: a cada edição, sem `aria-live` (atualiza a cada tecla).
// Texto de header comum nunca aparece: `••••••`.
export function RequestPreview({
  form,
  prefixes
}: {
  form: UseFormReturn<ToolFormValues>
  prefixes: string[]
}) {
  const t = useTranslations('tools.form')
  const { http_method, route, parameters, headers } = form.watch()
  const request = buildRequest({
    method: http_method,
    route: route.trim(),
    parameters: parameters.map(({ name, type, default_text }) => ({ name, type, defaultText: default_text })),
    headers,
    prefixes
  })

  return (
    <SectionCard
      id="tool-request"
      title={t('request')}
      description={t('requestDescription')}
      tabIndex={0}
      className="min-w-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background xl:sticky xl:top-6 xl:col-start-2 xl:row-span-4 xl:row-start-1 xl:max-h-[calc(100vh-3rem)] xl:self-start xl:overflow-y-auto"
    >
      {route.trim() === '' ? (
        <p className="rounded-md border bg-muted p-3 text-sm text-muted-foreground">
          {t('requestEmpty')}
        </p>
      ) : (
        <div role="group" aria-labelledby="tool-request" aria-describedby="request-legend" className="space-y-3">
          <div>
            <p className={LABEL}>{t('requestCall')}</p>
            <p className={BOX}>
              <span className="font-semibold text-primary">{request.method}</span>{' '}
              {request.url.map((part, index) => (
                <PartView key={index} part={part} />
              ))}
            </p>
          </div>

          {request.extras.length > 0 && (
            <div>
              <p className={LABEL}>{request.where === 'query' ? t('requestQuery') : t('requestBody')}</p>
              <p className={BOX}>
                {request.where === 'query' ? (
                  request.extras.map(({ name, value }, index) => (
                    <span key={`${index}-${name}`} className="block">
                      <span className="text-muted-foreground">{name}
                        {EQUALS}
                      </span>
                      <PartView part={value} />
                    </span>
                  ))
                ) : (
                  <>
                    {OPEN}
                    {request.extras.map(({ name, value }, index) => (
                      <span key={`${index}-${name}`} className="block pl-4">
                        <span className="text-muted-foreground">{JSON.stringify(name)}: </span>
                        <PartView part={value} />
                        {index < request.extras.length - 1 ? ',' : ''}
                      </span>
                    ))}
                    {CLOSE}
                  </>
                )}
              </p>
            </div>
          )}

          {request.headers.length > 0 && (
            <div>
              <p className={LABEL}>{t('requestHeaders')}</p>
              <p className={BOX}>
                {request.headers.map(({ name, value, masked }, index) => (
                  <span key={`${index}-${name}`} className="block">
                    <span className="text-muted-foreground">{name}:</span>{' '}
                    {masked ? (
                      <>
                        <span aria-hidden="true" className="tracking-widest text-muted-foreground">
                          {MASKED_TEXT}
                        </span>
                        <span className="sr-only">{t('maskedTextAria')}</span>
                      </>
                    ) : (
                      value
                    )}
                  </span>
                ))}
              </p>
            </div>
          )}

          <p id="request-legend" className="text-xs text-muted-foreground">
            {t('requestLegend')}
          </p>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="rounded-sm bg-primary-soft px-0.5 text-foreground">
              {t('requestLegendDefault')}
            </span>
            <span>
              <PartView part={{ text: '{x}', mark: 'placeholder' }} /> {t('requestLegendPlaceholder')}
            </span>
          </p>
        </div>
      )}
    </SectionCard>
  )
}
