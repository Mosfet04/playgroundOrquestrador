'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Lock } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Chip } from '@/components/ui/loading'
import type { ProviderOption } from '@/types/management'
import { useConfigSchema } from '../common/useConfigSchema'
import { OrchestratorSection } from './OrchestratorSection'
import type { ReloadOutcome } from './ReloadDialog'
import { SectionError, SectionSkeleton, SettingsSection, StatusNote, ToneBadge } from './parts'

/**
 * /settings (P4-05): saúde do orquestrador (a leitura da casca) e o que a
 * plataforma oferece (GET /api/config/schema), cada leitura com carregando e
 * erro próprios. Só leitura, sem versão do orquestrador (D-P4-05-2).
 */
export function Settings() {
  const t = useTranslations('settings')
  const [outcome, setOutcome] = useState<ReloadOutcome | null>(null)

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 sm:p-6">
      <div>
        <h1 tabIndex={-1} className="text-2xl font-semibold tracking-tight focus:outline-none">
          {t('title')}
        </h1>
        <p className="mt-1 text-muted-foreground">{t('subtitle')}</p>
      </div>
      <div aria-live="polite" aria-atomic="true">
        {outcome && <ReloadOutcomeNote outcome={outcome} />}
      </div>
      <OrchestratorSection onOutcome={setOutcome} />
      <PlatformSections />
    </div>
  )
}

function ReloadOutcomeNote({ outcome }: { outcome: ReloadOutcome }) {
  const t = useTranslations('settings')
  switch (outcome.kind) {
    case 'reloaded':
      return (
        <StatusNote tone="success" role="status">
          {t('reloaded', { revision: outcome.revision, previous: outcome.previous })}
        </StatusNote>
      )
    case 'not_confirmed':
      return (
        <StatusNote tone="warning" role="status">
          {t('reloadNotConfirmed')}
        </StatusNote>
      )
    case 'unreachable':
      return (
        <StatusNote tone="destructive" role="alert">
          {t('reloadUnreachable')}
        </StatusNote>
      )
    case 'failed':
      return (
        <StatusNote tone="destructive" role="alert">
          {t('reloadFailed', { status: outcome.status })}
        </StatusNote>
      )
  }
}

// Config store e provedores, do /admin/schema; em erro, uma seção só (§4).
function PlatformSections() {
  const t = useTranslations('settings')
  const { state, retrying, reload } = useConfigSchema()

  if (state.status === 'error')
    return (
      <SettingsSection title={t('schemaSection')}>
        <SectionError
          message={t('schemaError')}
          code="SCHEMA_UNAVAILABLE"
          retrying={retrying}
          onRetry={reload}
        />
      </SettingsSection>
    )

  const schema = state.status === 'ready' ? state.schema : undefined
  return (
    <>
      <SettingsSection
        title={t('configStore')}
        busy={!schema}
        aside={
          schema &&
          (schema.writable ? (
            <ToneBadge tone="success">{t('writable')}</ToneBadge>
          ) : (
            <ToneBadge tone="warning" icon={Lock}>
              {t('readOnly')}
            </ToneBadge>
          ))
        }
      >
        {!schema ? (
          <SectionSkeleton />
        ) : (
          <p className="text-sm">
            {schema.writable
              ? t('writableDescription')
              : t.rich('readOnlyDescription', {
                  b: (chunks) => <b className="font-semibold">{chunks}</b>
                })}
          </p>
        )}
      </SettingsSection>
      <ProvidersSection
        title={t('chatProviders')}
        emptyText={t('noChatProviders')}
        providers={schema?.chatProviders}
      />
      <ProvidersSection
        title={t('embedderProviders')}
        emptyText={t('noEmbedderProviders')}
        providers={schema?.embedderProviders}
      />
    </>
  )
}

// Tabela a partir de md; abaixo, cada linha empilha com o rótulo do campo.
function ProvidersSection({
  title,
  emptyText,
  providers
}: {
  title: string
  emptyText: string
  providers?: ProviderOption[]
}) {
  const t = useTranslations('settings')
  const columns = [t('provider'), t('modelParams'), t('baseUrl')]

  return (
    <SettingsSection
      title={title}
      busy={!providers}
      aside={providers && <Badge variant="neutral">{providers.length}</Badge>}
    >
      {!providers ? (
        <SectionSkeleton />
      ) : providers.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        <table className="-my-2 block w-full text-sm md:table">
          <thead className="hidden md:table-header-group">
            <tr className="border-b border-border">
              {columns.map((column) => (
                <th
                  key={column}
                  scope="col"
                  className="px-3 py-2 text-left font-mono text-xs font-medium text-muted-foreground"
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="block md:table-row-group">
            {providers.map((provider) => (
              <tr
                key={provider.name}
                className="block border-b border-border py-2.5 last:border-b-0 md:table-row md:py-0"
              >
                <ProviderCell label={columns[0]}>
                  <span className="font-mono">{provider.name}</span>
                </ProviderCell>
                <ProviderCell label={columns[1]}>
                  <span className="flex flex-wrap gap-1">
                    {provider.modelParams.map((param) => (
                      <Chip key={param}>{param}</Chip>
                    ))}
                  </span>
                </ProviderCell>
                <ProviderCell label={columns[2]}>
                  {provider.requiresBaseUrl ? (
                    <Badge variant="neutral">{t('requiresBaseUrl')}</Badge>
                  ) : (
                    <span className="text-muted-foreground">{t('providerDefault')}</span>
                  )}
                </ProviderCell>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </SettingsSection>
  )
}

function ProviderCell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <td className="block py-0.5 align-top md:table-cell md:px-3 md:py-2.5">
      <span className="block text-xs text-muted-foreground md:hidden">{label}</span>
      {children}
    </td>
  )
}
