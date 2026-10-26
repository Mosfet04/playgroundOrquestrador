'use client'

import { Controller, type UseFormReturn } from 'react-hook-form'
import { useTranslations } from 'next-intl'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LiveStatus } from '@/components/ui/loading'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import type { ConfigSchema } from '@/types/management'
import { FieldError } from '../common/FieldError'
import { FieldWarning } from '../common/FieldWarning'
import type { AgentFormValues } from './agentFormValues'
import { SectionCard } from '../common/SectionCard'

type SwitchField =
  | 'markdown'
  | 'add_datetime_to_context'
  | 'add_history_to_context'
  | 'reasoning'
  | 'user_memory_active'
  | 'summary_active'

const ITEM_CLASS = 'space-y-2 border-t border-border py-3 first:border-t-0 first:pt-0 last:pb-0'

// Seção Execução (P3-02): o que o agent recebe de contexto e como responde.
// Os defaults e a faixa são os do schema; memória e resumo, os da entidade
// (`false`, D-P3-02-1). Sem o schema não há default a mostrar: skeleton
// (carregando) ou aviso (falha).
export function ExecutionSection({
  form,
  schema,
  status,
  locked
}: {
  form: UseFormReturn<AgentFormValues>
  schema: ConfigSchema | undefined
  status: 'loading' | 'error' | 'ready'
  locked: boolean
}) {
  const t = useTranslations('agents.form')
  const { register, watch, formState } = form
  const { errors } = formState
  const historyOn = !!watch('add_history_to_context')
  const reasoningOn = !!watch('reasoning')

  const header = { id: 'agent-execution', title: t('execution'), description: t('executionDescription') }

  if (!schema)
    return (
      <SectionCard {...header} busy={status === 'loading'}>
        {status === 'loading' ? (
          <>
            <LiveStatus>{t('executionLoading')}</LiveStatus>
            <ul aria-hidden="true">
              {[0, 1, 2, 3, 4, 5].map((key) => (
                <li key={key} className={`${ITEM_CLASS} flex items-start gap-3`}>
                  <Skeleton className="h-5 w-9 shrink-0 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-1/3" />
                    <Skeleton className="h-3 w-2/3" />
                  </div>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="rounded-md border bg-muted p-3 text-sm text-muted-foreground">
            {t('executionUnavailable')}
          </p>
        )}
      </SectionCard>
    )

  const { numHistoryRuns } = schema.agent
  const rangeValues = { min: numHistoryRuns.minimum, max: numHistoryRuns.maximum }

  const item = (
    field: SwitchField,
    label: string,
    help: string,
    defaultOn: boolean,
    extra?: { controls?: string; describedBy?: string; children?: React.ReactNode }
  ) => (
    <li key={field} className={ITEM_CLASS}>
      <div className="flex items-start gap-3">
        <Controller
          control={form.control}
          name={field}
          render={({ field: control }) => (
            <Switch
              id={field}
              ref={control.ref}
              checked={!!control.value}
              disabled={locked}
              aria-controls={extra?.controls}
              aria-describedby={`${field}-help${extra?.describedBy ? ` ${extra.describedBy}` : ''}`}
              onCheckedChange={control.onChange}
            />
          )}
        />
        <div className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div className="min-w-0 space-y-0.5">
            <Label htmlFor={field} className="font-medium">
              {label}
            </Label>
            <p id={`${field}-help`} className="text-sm text-muted-foreground">
              {help}
            </p>
          </div>
          <span className="whitespace-nowrap font-mono text-xs text-muted-foreground">
            {defaultOn ? t('defaultOn') : t('defaultOff')}
          </span>
        </div>
      </div>
      {extra?.children}
      <FieldError message={errors[field]?.message} />
    </li>
  )

  return (
    <SectionCard {...header}>
      <ul>
        {item('markdown', t('markdown'), t('markdownHelp'), schema.agent.markdown)}
        {item('add_datetime_to_context', t('addDatetime'), t('addDatetimeHelp'), schema.agent.addDatetimeToContext)}
        {item('add_history_to_context', t('addHistory'), t('addHistoryHelp'), schema.agent.addHistoryToContext, {
          controls: 'num_history_runs',
          children: (
            <div className="space-y-2 pl-12">
              <Label
                htmlFor="num_history_runs"
                className={historyOn ? 'font-medium' : 'font-medium text-muted-foreground'}
              >
                {t('numHistoryRuns')}
              </Label>
              <Input
                id="num_history_runs"
                type="number"
                inputMode="numeric"
                step={1}
                min={numHistoryRuns.minimum}
                max={numHistoryRuns.maximum}
                disabled={!historyOn}
                aria-describedby={`num_history_runs-help${errors.num_history_runs ? ' num_history_runs-error' : ''}`}
                aria-invalid={errors.num_history_runs ? true : undefined}
                variant={errors.num_history_runs ? 'destructive' : undefined}
                className="w-24 font-mono"
                {...register('num_history_runs', {
                  valueAsNumber: true,
                  validate: (value) =>
                    !historyOn ||
                    (Number.isInteger(value) &&
                      value !== undefined &&
                      value >= numHistoryRuns.minimum &&
                      value <= numHistoryRuns.maximum) ||
                    t('numHistoryRunsRange', rangeValues)
                })}
              />
              <p id="num_history_runs-help" className="text-xs text-muted-foreground">
                {historyOn ? '' : `${t('numHistoryRunsOff')} `}
                {t('numHistoryRunsHelp', { ...rangeValues, default: numHistoryRuns.default })}
              </p>
              <FieldError id="num_history_runs-error" message={errors.num_history_runs?.message} />
            </div>
          )
        })}
        {item('reasoning', t('reasoning'), t('reasoningHelp'), schema.agent.reasoning, {
          describedBy: reasoningOn ? 'reasoning-warning' : undefined,
          children: reasoningOn && (
            <div className="pl-12">
              <FieldWarning id="reasoning-warning">{t('reasoningWarning')}</FieldWarning>
            </div>
          )
        })}
        {item('user_memory_active', t('userMemory'), t('userMemoryHelp'), false)}
        {item('summary_active', t('summary'), t('summaryHelp'), false)}
      </ul>
    </SectionCard>
  )
}
