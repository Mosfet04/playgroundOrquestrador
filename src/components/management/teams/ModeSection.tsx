'use client'

import { useTranslations } from 'next-intl'

import { LiveStatus } from '@/components/ui/loading'
import { Skeleton } from '@/components/ui/skeleton'
import { FieldError } from '../common/FieldError'
import { FieldWarning } from '../common/FieldWarning'
import { OptionCard } from '../common/OptionCard'
import { SectionCard } from '../common/SectionCard'
import { withCurrent } from '../common/useConfigSchema'
import { DEFAULT_MODE } from './teamFormValues'

// Descrições dos modos que o playground conhece; modo do schema sem tradução
// aparece sem descrição.
const KNOWN_MODES = ['route', 'coordinate', 'broadcast', 'tasks'] as const
const knownMode = (mode: string) => KNOWN_MODES.find((known) => known === mode)

// Seção Modo de coordenação (P3-04): um cartão de rádio por modo do schema
// (`team.mode`), para comparar as descrições. O valor gravado fora das opções
// vira um cartão extra enquanto for o atual.
export function ModeSection({
  modes,
  status,
  value,
  onChange,
  error,
  locked,
  groupRef
}: {
  /** Modos do schema; ausente com o schema ainda não lido ou com falha. */
  modes: string[] | undefined
  status: 'loading' | 'error' | 'ready'
  value: string
  onChange: (mode: string) => void
  error?: string
  locked: boolean
  groupRef: React.Ref<HTMLFieldSetElement>
}) {
  const t = useTranslations('teams.form')
  const tc = useTranslations('common')
  const header = { id: 'team-mode-title', title: t('mode'), description: t('modeDescription') }

  if (!modes)
    return (
      <SectionCard {...header} busy={status === 'loading'}>
        {status === 'loading' ? (
          <>
            <LiveStatus>{tc('optionsLoading')}</LiveStatus>
            <ul aria-hidden="true" className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {[0, 1, 2, 3].map((key) => (
                <li key={key} className="space-y-2 rounded-lg border border-border p-3">
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="h-3 w-4/5" />
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="rounded-md border bg-muted p-3 text-sm text-muted-foreground">
            {t('modeUnavailable')}
          </p>
        )}
      </SectionCard>
    )

  return (
    <SectionCard {...header}>
      <fieldset ref={groupRef} aria-describedby={error ? 'team-mode-error' : undefined} className="m-0 min-w-0 border-0 p-0">
        <legend className="sr-only">{t('mode')}</legend>
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {withCurrent(modes, value).map((mode, index) => {
            const known = knownMode(mode)
            const notInSchema = !modes.includes(mode)
            return (
              <li key={mode} className="min-w-0">
                <OptionCard
                  id={`team-mode-${index}`}
                  type="radio"
                  name="team-mode"
                  value={mode}
                  checked={value === mode}
                  disabled={locked}
                  onChange={() => onChange(mode)}
                  describedBy={notInSchema ? 'team-mode-not-in-schema' : undefined}
                  label={<span className="font-mono">{mode}</span>}
                  description={known ? t(`modeDescriptions.${known}`) : undefined}
                  aside={
                    mode === DEFAULT_MODE && (
                      <span className="font-mono text-xs text-muted-foreground">{t('modeDefault')}</span>
                    )
                  }
                >
                  {notInSchema && (
                    <FieldWarning id="team-mode-not-in-schema">{t('modeNotInSchema', { mode })}</FieldWarning>
                  )}
                </OptionCard>
              </li>
            )
          })}
        </ul>
      </fieldset>
      <FieldError id="team-mode-error" message={error} />
    </SectionCard>
  )
}
