'use client'

import { useId, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Lock } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/loading'
import { changedWindow, type DiffCell, type DiffRow } from '@/lib/formDiff'
import { cn } from '@/lib/utils'

// Texto longo recolhe em 4 linhas; o "Mostrar tudo" só aparece se passa disso.
const isLong = (cell: DiffCell) =>
  cell.kind === 'text' &&
  cell.long &&
  (cell.text.length > 240 || cell.text.split('\n').length > 4)

const textOf = (cell: DiffCell) => (cell.kind === 'text' ? cell.text : '')

function Muted({ children }: { children: string }) {
  return <span className="text-muted-foreground">{children}</span>
}

// `collapsed`: a janela do texto longo recolhido (D-P4-02-3).
function Cell({ cell, collapsed }: { cell: DiffCell; collapsed?: { text: string; skipped: number } }) {
  const tc = useTranslations('common')
  const tf = useTranslations('tools.form')

  switch (cell.kind) {
    case 'absent':
      return <Muted>{tc('conflictAbsent')}</Muted>
    case 'bool':
      return <span>{cell.on ? tc('conflictOn') : tc('conflictOff')}</span>
    case 'text':
      return cell.text === '' ? (
        <Muted>{tc('conflictEmpty')}</Muted>
      ) : (
        <>
          {!!collapsed?.skipped && (
            <span className="w-full text-xs text-muted-foreground">
              {tc('diffSkipped', { count: collapsed.skipped })}
            </span>
          )}
          <span
            className={cn(
              'min-w-0 break-words',
              cell.mono && 'font-mono text-xs',
              cell.long && 'whitespace-pre-wrap',
              collapsed && 'line-clamp-4'
            )}
          >
            {collapsed ? collapsed.text : cell.text}
          </span>
        </>
      )
    case 'ids':
      return cell.ids.length === 0 ? (
        <Muted>{tc('conflictEmpty')}</Muted>
      ) : (
        <>
          {cell.ids.map((id) => (
            <Chip key={id} className="h-auto min-h-6 whitespace-normal break-all">
              {id}
            </Chip>
          ))}
        </>
      )
    case 'ref':
      return (
        <>
          <span className="min-w-0 break-all font-mono text-xs">{cell.text}</span>
          <Chip>{tf('headerKind.reference')}</Chip>
        </>
      )
    case 'stored':
    case 'secretText':
      return (
        <>
          <span aria-hidden="true" className="font-mono text-muted-foreground">
            {cell.kind === 'stored' ? '***' : '••••••'}
          </span>
          <span className="sr-only">{tf('maskedTextAria')}</span>
          <Chip>
            {cell.kind === 'stored' && <Lock aria-hidden="true" className="size-3" />}
            {cell.kind === 'stored' ? tf('headerKind.masked') : tf('headerKind.text')}
          </Chip>
        </>
      )
    case 'param':
      return (
        <span className="min-w-0 break-words">
          <span className="font-mono text-xs">
            {[
              cell.type,
              cell.required ? tc('conflictRequired') : tc('conflictOptional'),
              ...(cell.fallback === '' ? [] : [tc('conflictDefault', { value: cell.fallback })])
            ].join(' · ')}
          </span>
          {cell.description !== '' && (
            <span className="line-clamp-2 block text-xs text-muted-foreground">
              {cell.description}
            </span>
          )}
        </span>
      )
  }
}

// Ajuda da linha, uma só (os dois lados compartilham o tipo).
function hintOf(row: DiffRow, tc: ReturnType<typeof useTranslations<'common'>>) {
  const { mine, current } = row
  if (mine.kind === 'ids' && current.kind === 'ids')
    return mine.same > 0 ? tc('conflictSame', { count: mine.same }) : undefined
  if (mine.kind === 'secretText' || current.kind === 'secretText') return tc('conflictTextHidden')
  return undefined
}

type Variant = 'conflict' | 'review'

function Row({ row, variant }: { row: DiffRow; variant: Variant }) {
  const tc = useTranslations('common')
  const [expanded, setExpanded] = useState(false)
  const labelId = useId()
  const hint = hintOf(row, tc)
  const collapsible = isLong(row.mine) || isLong(row.current)
  const view = collapsible && !expanded ? changedWindow(textOf(row.mine), textOf(row.current)) : undefined
  const mine = { cell: row.mine, collapsed: view && { text: view.mine, skipped: view.skipped } }
  const current = { cell: row.current, collapsed: view && { text: view.current, skipped: view.skipped } }
  const columns =
    variant === 'review'
      ? ([[tc('reviewBefore'), current], [tc('reviewAfter'), mine]] as const)
      : ([[tc('conflictYours'), mine], [tc('conflictCurrent'), current]] as const)

  return (
    <li className="space-y-2 p-3">
      <p id={labelId} className="text-sm font-medium">
        {row.label}
        {row.item !== undefined && (
          <>
            <span className="px-1 font-normal text-muted-foreground">›</span>
            <span className="font-mono text-xs">{row.item}</span>
          </>
        )}
      </p>
      <dl aria-labelledby={labelId} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {columns.map(([term, column]) => (
          <div key={term} className="flex min-w-0 flex-col gap-1">
            <dt className="text-xs font-medium text-muted-foreground">{term}</dt>
            <dd className="m-0 flex min-h-8 flex-wrap items-center gap-x-2 gap-y-1 rounded-md bg-muted px-2 py-1.5 text-sm break-words">
              <Cell {...column} />
            </dd>
          </div>
        ))}
      </dl>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {collapsible && (
        <Button
          type="button"
          variant="link"
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
          className="h-auto p-0 text-xs"
        >
          {expanded ? tc('conflictShowLess') : tc('conflictShowAll')}
        </Button>
      )}
    </li>
  )
}

/**
 * Lista rolável das linhas que diferem: "O seu valor × Atual" no conflito (P3-06)
 * e "Antes × Depois" na revisão antes de salvar (P4-02) e no histórico (P4-04).
 * `mine` é o lado novo (o formulário, a versão escolhida) e `current`, a versão
 * comparada. `label` troca o nome da região; `className`, a altura máxima.
 */
export function DiffList({
  rows,
  variant = 'conflict',
  label,
  className
}: {
  rows: DiffRow[]
  variant?: Variant
  label?: string
  className?: string
}) {
  const tc = useTranslations('common')
  return (
    <div
      role="region"
      aria-label={label ?? (variant === 'review' ? tc('reviewList') : tc('conflictList'))}
      tabIndex={0}
      className={cn(
        'max-h-[40dvh] overflow-y-auto rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:max-h-80',
        className
      )}
    >
      <ul className="divide-y divide-border rounded-md border border-border">
        {rows.map((row) => (
          <Row key={row.key} row={row} variant={variant} />
        ))}
      </ul>
    </div>
  )
}
