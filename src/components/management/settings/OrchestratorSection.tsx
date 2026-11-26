'use client'

import { useState } from 'react'
import { useFormatter, useTranslations, type Messages } from 'next-intl'
import { RotateCw } from 'lucide-react'

import {
  useRefreshRuntime,
  useRuntimeState,
  type RuntimeState
} from '@/components/layout/RuntimeRevision'
import { Button } from '@/components/ui/button'
import type { RuntimeHealth } from '@/lib/runtimeHealth'
import { cn } from '@/lib/utils'
import { ReloadDialog, type ReloadOutcome } from './ReloadDialog'
import { SectionError, SectionSkeleton, SettingsSection, StatusNote, ToneBadge, type Tone } from './parts'

type CheckStatus =
  | RuntimeHealth['checks']['database']
  | RuntimeHealth['checks']['memory']['status']
  | RuntimeHealth['checks']['telemetry']

const CHECK_BADGE = {
  healthy: { tone: 'success', label: 'healthy' },
  configured: { tone: 'success', label: 'configured' },
  warning: { tone: 'warning', label: 'checkWarning' },
  unavailable: { tone: 'neutral', label: 'checkUnavailable' },
  not_configured: { tone: 'neutral', label: 'notConfigured' },
  error: { tone: 'destructive', label: 'checkError' }
} as const satisfies Record<CheckStatus, { tone: Tone; label: keyof Messages['settings'] }>

const BUTTON = 'h-11 sm:h-9'

/**
 * Seção Orquestrador (P4-05 §3.1): a leitura de saúde da casca (sem request
 * próprio), "Atualizar" (relê a mesma leitura) e "Recarregar runtime". O
 * desfecho da recarga vai a `onOutcome`, que a página mostra na região viva.
 */
export function OrchestratorSection({
  onOutcome
}: {
  onOutcome: (outcome: ReloadOutcome | null) => void
}) {
  const t = useTranslations('settings')
  const runtime = useRuntimeState()
  const refresh = useRefreshRuntime()
  const [refreshing, setRefreshing] = useState(false)

  const reread = async () => {
    if (refreshing) return
    onOutcome(null)
    setRefreshing(true)
    await refresh()
    setRefreshing(false)
  }

  if (runtime.status !== 'ready')
    return (
      <SettingsSection title={t('orchestrator')} busy={runtime.status === 'loading'}>
        {runtime.status === 'loading' ? (
          <SectionSkeleton />
        ) : (
          <SectionError
            message={t('healthError')}
            code={runtime.code ?? 'ORCHESTRATOR_UNAVAILABLE'}
            retrying={refreshing}
            onRetry={() => void reread()}
          />
        )}
      </SettingsSection>
    )

  const degraded = runtime.health.status === 'degraded'
  return (
    <SettingsSection
      title={t('orchestrator')}
      aside={
        <>
          <ToneBadge tone={degraded ? 'warning' : 'success'}>
            {t(degraded ? 'degraded' : 'healthy')}
          </ToneBadge>
          <Button
            variant="ghost"
            aria-disabled={refreshing || undefined}
            className={cn(BUTTON, 'aria-disabled:opacity-50')}
            onClick={() => void reread()}
          >
            <RotateCw aria-hidden="true" className={cn(refreshing && 'motion-safe:animate-spin')} />
            {t(refreshing ? 'refreshing' : 'refresh')}
          </Button>
          <ReloadDialog
            revision={runtime.revision}
            onStart={() => onOutcome(null)}
            onDone={onOutcome}
            disabled={refreshing}
            triggerClassName={BUTTON}
          />
        </>
      }
    >
      {degraded && (
        <StatusNote tone="warning" role="status" className="mb-4">
          {t('degradedNote')}
        </StatusNote>
      )}
      <HealthFacts runtime={runtime} />
      <HealthChecks checks={runtime.health.checks} />
    </SettingsSection>
  )
}

function HealthFacts({ runtime }: { runtime: Extract<RuntimeState, { status: 'ready' }> }) {
  const t = useTranslations('settings')
  const tc = useTranslations('common')
  const format = useFormatter()
  const { responseTimeMs } = runtime.health
  const browserTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const facts = [
    [t('revision'), runtime.revision],
    [
      t('responseTime'),
      responseTimeMs === undefined
        ? tc('notAvailable')
        : t('responseTimeValue', { value: format.number(responseTimeMs, { maximumFractionDigits: 1 }) })
    ],
    // Relógio do navegador (como o Histórico e as listas), não o fuso do servidor.
    [t('readAt'), format.dateTime(runtime.readAt, { timeStyle: 'medium', timeZone: browserTimeZone })]
  ] as const

  return (
    <dl className="mb-4 grid grid-cols-[max-content_1fr] gap-x-6 gap-y-1.5 text-sm">
      {facts.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="font-mono tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  )
}

function HealthChecks({ checks }: { checks: RuntimeHealth['checks'] }) {
  const t = useTranslations('settings')
  const format = useFormatter()
  const { usagePercent, availableGb } = checks.memory
  const memoryDetail = [
    usagePercent !== undefined &&
      t('memoryUsage', {
        value: format.number(usagePercent / 100, { style: 'percent', maximumFractionDigits: 1 })
      }),
    availableGb !== undefined &&
      t('memoryFree', { value: format.number(availableGb, { maximumFractionDigits: 1 }) })
  ]
    .filter(Boolean)
    .join(' · ')

  const rows = [
    { name: t('database'), status: checks.database, detail: checks.database === 'error' && t('databaseError') },
    { name: t('memory'), status: checks.memory.status, detail: memoryDetail },
    {
      name: t('telemetry'),
      status: checks.telemetry,
      detail: checks.telemetry === 'not_configured' && t('telemetryOptional')
    }
  ]

  return (
    <ul aria-label={t('checks')} className="divide-y divide-border rounded-md border border-border">
      {rows.map(({ name, status, detail }) => {
        const { tone, label } = CHECK_BADGE[status]
        return (
          <li
            key={name}
            className="flex min-h-[52px] flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 sm:flex-nowrap"
          >
            <span className="min-w-0 flex-1 text-sm font-medium sm:w-48 sm:flex-none">{name}</span>
            <ToneBadge tone={tone}>{t(label)}</ToneBadge>
            {detail && (
              <span className="basis-full text-sm text-muted-foreground sm:flex-1 sm:basis-auto">
                {detail}
              </span>
            )}
          </li>
        )
      })}
    </ul>
  )
}
