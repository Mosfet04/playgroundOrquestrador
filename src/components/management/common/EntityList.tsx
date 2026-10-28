'use client'

import { type ReactNode } from 'react'
import { useFormatter, useTranslations } from 'next-intl'

import { Chip } from '@/components/ui/loading'

// Peças comuns das listas de agents e tools (P1-05b, docs/design/P1-05b.md).

type Counts = { total: number; active?: number; inactive?: number }

/**
 * Contagem do resultado mostrado (D-P1-05-1, decisão 0014): `total` é o do
 * filtro no BFF. Por status só quando tudo veio (total ≤ carregados) e sem
 * filtro de status ligado.
 */
export function listCounts(
  items: { active: boolean }[],
  total: number,
  statusFiltered = false
): Counts {
  if (statusFiltered || total > items.length) return { total }
  const active = items.filter((item) => item.active).length
  return { total, active, inactive: items.length - active }
}

/** Chips de contagem; a região fica sempre montada para o leitor anunciar a troca. */
export function CountChips({
  namespace,
  counts
}: {
  namespace: 'agents' | 'teams' | 'tools'
  counts?: Counts
}) {
  const t = useTranslations(namespace)
  const n = (chunks: ReactNode) => <span className="font-semibold">{chunks}</span>
  return (
    <div aria-live="polite" aria-atomic="true" className="mt-3 flex flex-wrap gap-2 empty:mt-0">
      {counts && (
        <Chip className="text-muted-foreground">
          {t.rich('countTotal', {
            count: counts.total,
            n: (chunks) => <span className="font-semibold text-foreground">{chunks}</span>
          })}
        </Chip>
      )}
      {counts?.active !== undefined && (
        <Chip className="text-success">
          <span aria-hidden="true" className="size-2 rounded-full bg-current" />
          {t.rich('countActive', { count: counts.active, n })}
        </Chip>
      )}
      {counts?.inactive !== undefined && (
        <Chip className="text-muted-foreground">
          {t.rich('countInactive', { count: counts.inactive, n })}
        </Chip>
      )}
    </div>
  )
}

/** "Mostrando 100 de 112" abaixo da lista, só acima do teto do limit. */
export function ShowingOf({ shown, total }: { shown: number; total: number }) {
  const t = useTranslations('common')
  if (total <= shown) return null
  return <p className="text-xs text-muted-foreground">{t('showingOf', { shown, total })}</p>
}

const NO_DATE = '—'

/** Coluna "Atualizado": data curta em mono, completa no `title`. */
export function UpdatedAt({ value }: { value?: string | Date }) {
  const format = useFormatter()
  const t = useTranslations('common')
  if (!value)
    return (
      <>
        <span aria-hidden="true">{NO_DATE}</span>
        <span className="sr-only">{t('notAvailable')}</span>
      </>
    )
  const date = new Date(value)
  // A lista só renderiza no cliente, depois do fetch: o fuso é o do navegador,
  // não o do servidor que o provider herda (sem risco de hidratação).
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
  // `relative` põe o <time> acima do ::after do link esticado: o title aparece no hover.
  return (
    <time
      dateTime={date.toISOString()}
      title={format.dateTime(date, { dateStyle: 'short', timeStyle: 'short', timeZone })}
      className="relative"
    >
      {format.dateTime(date, {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        timeZone
      })}
    </time>
  )
}

/** Link do nome esticado sobre a linha: um alvo de Tab por linha, anel V8 na linha. */
export const rowLinkClass =
  'font-medium text-foreground after:absolute after:inset-0 hover:text-primary focus-visible:outline-none focus-visible:after:rounded-sm focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-ring'
