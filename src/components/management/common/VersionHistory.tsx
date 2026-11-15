'use client'

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { AlertCircle, History, Undo2, X } from 'lucide-react'

import { useApplyRevision } from '@/components/layout/RuntimeRevision'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/loading'
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { ABSENT, type DiffRow } from '@/lib/formDiff'
import { cn } from '@/lib/utils'
import type { ConfigHistoryPage, ConfigVersion } from '@/types/management'
import { applyFailure, errorBody, type ApplyResult } from './applyResult'
import { DiffList } from './DiffList'
import { rejectedField } from './rejectedField'
import { RestoreDialog } from './RestoreDialog'
import { useRequestError } from './useRequestError'

type Kind = 'agents' | 'teams' | 'tools'
/** Versão com documento: a que pode ser restaurada. */
export type RestorableVersion<T> = ConfigVersion<T> & { document: T }

const PAGE_SIZE = 20
const FIELD_CHIPS = 3
const SKELETON_ROWS = 4

type More = { status: 'idle' } | { status: 'loading' } | { status: 'error'; code?: number }
type ListState<T> =
  | { status: 'loading' }
  | { status: 'error'; code?: number }
  | { status: 'ready'; items: ConfigVersion<T>[]; total: number; more: More }

type Restoring<T> = {
  item: RestorableVersion<T>
  rows: DiffRow[]
  saving: boolean
  rejected?: { detail?: string }
}

type Entry<T> = {
  item: ConfigVersion<T>
  rows: DiffRow[]
  /** A versão lida pelo editor. */
  current: boolean
  restorable: boolean
}

// O BFF já filtrou o campo do 422 (identificador do formulário).
const anyField = (field: string): field is string => field !== ''

async function fetchPage<T>(
  url: string,
  offset: number
): Promise<{ ok: true; page: ConfigHistoryPage<T> } | { ok: false; code?: number }> {
  try {
    const response = await fetch(`${url}/history?offset=${offset}&limit=${PAGE_SIZE}`)
    const body = response.ok ? await response.json() : null
    return body?.success ? { ok: true, page: body.data } : { ok: false, code: response.status }
  } catch (error) {
    console.error('Error loading history:', url, error)
    return { ok: false }
  }
}

// As linhas de cada versão, do documento anterior para o dela; na criação, o que
// ela preencheu, com "ausente" antes. A mais nova com cada número é a que o
// orquestrador restaura (um id removido e recriado repete números).
function toEntries<T extends { version: number }>(
  items: ConfigVersion<T>[],
  version: number,
  diffVersions: (before: T | null, after: T) => DiffRow[]
): Entry<T>[] {
  const seen = new Set<number>()
  return items.map((item) => {
    if (item.document === null) return { item, rows: [], current: false, restorable: false }
    const newest = !seen.has(item.version)
    seen.add(item.version)
    const current = newest && item.version === version
    const rows =
      item.previous === null
        ? diffVersions(null, item.document).map((row) => ({ ...row, current: ABSENT }))
        : diffVersions(item.previous, item.document)
    return { item, rows, current, restorable: newest && !current }
  })
}

// Rótulos dos campos alterados, sem repetir (as linhas de uma lista têm o mesmo).
const fieldLabels = (rows: DiffRow[]) => [...new Set(rows.map((row) => row.label))]

function VersionRow<T>({
  entry,
  formatDate,
  onRestore
}: {
  entry: Entry<T>
  formatDate: (at: string) => string
  /** Recebe o botão, que volta a ter o foco quando a confirmação fecha sem restaurar. */
  onRestore: (trigger: HTMLButtonElement) => void
}) {
  const tc = useTranslations('common')
  const [expanded, setExpanded] = useState(false)
  const panelId = useId()
  const { item, rows, current, restorable } = entry
  const labels = fieldLabels(rows)
  const hidden = labels.length - FIELD_CHIPS

  return (
    <li className={cn('flex flex-col gap-2 p-3', current && 'bg-muted')}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono font-semibold">{tc('historyVersion', { version: item.version })}</span>
        {current && <Badge variant="success">{tc('historyCurrent')}</Badge>}
        {item.document === null && <Badge variant="neutral">{tc('historyRemoved')}</Badge>}
        <span title={tc('historyActorHint')}>
          <Chip>{item.actor}</Chip>
        </span>
        <time
          dateTime={item.at}
          title={tc('historyUtc', { iso: new Date(item.at).toISOString() })}
          className="w-full text-xs text-muted-foreground sm:ml-auto sm:w-auto"
        >
          {formatDate(item.at)}
        </time>
      </div>
      {labels.length > 0 && (
        <div role="group" aria-label={tc('reviewList')} className="flex flex-wrap gap-1">
          {labels.slice(0, FIELD_CHIPS).map((label) => (
            <Chip key={label}>{label}</Chip>
          ))}
          {hidden > 0 && <Chip>{tc('historyMoreFields', { count: hidden })}</Chip>}
        </div>
      )}
      {item.document !== null && rows.length === 0 && (
        <p className="text-xs text-muted-foreground">{tc('historyNoVisible')}</p>
      )}
      <div id={panelId}>
        {expanded && (
          <DiffList
            rows={rows}
            variant="review"
            label={tc('historyChangedIn', { version: item.version })}
            className="max-h-60 sm:max-h-60"
          />
        )}
      </div>
      {(rows.length > 0 || restorable) && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          {rows.length > 0 && (
            <Button
              variant="link"
              className="h-11 p-0 sm:h-auto"
              aria-expanded={expanded}
              aria-controls={panelId}
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? tc('historyHideChanges') : tc('historyShowChanges')}
            </Button>
          )}
          {restorable && (
            <Button
              variant="outline"
              size="sm"
              className="ml-auto h-11 sm:h-8"
              aria-label={tc('restoreVersion', { version: item.version })}
              onClick={(event) => onRestore(event.currentTarget)}
            >
              <Undo2 aria-hidden="true" />
              {tc('restore')}
            </Button>
          )}
        </div>
      )}
      {current && <p className="text-xs text-muted-foreground">{tc('historyCurrentHint')}</p>}
    </li>
  )
}

/**
 * Histórico de versões do editor (P4-04): botão no cabeçalho e Sheet à direita
 * com as escritas pela API Admin, mais nova primeiro, carregadas só ao abrir
 * (de 20 em 20). Restaurar confirma no `RestoreDialog` e grava com o If-Match da
 * versão lida; o editor recebe o desfecho: `onRestored` (200, passa ao
 * documento restaurado), `onUnconfirmed` (5xx: pode ter gravado) e `onConflict`
 * (412, o conflito da P3-06 em modo restaurar).
 */
export function VersionHistory<T extends { version: number }>({
  kind,
  url,
  entity,
  name,
  isDirty,
  diffVersions,
  onRestored,
  onUnconfirmed,
  onConflict
}: {
  kind: Kind
  /** O item no BFF (`/api/agents/<id>`). */
  url: string
  /** A versão lida pelo editor. */
  entity: T
  name: string
  isDirty: boolean
  /** As linhas de `before` (null: nada antes) para `after`, na ordem da tela. Estável. */
  diffVersions: (before: T | null, after: T) => DiffRow[]
  onRestored: (saved: T, result: ApplyResult) => void
  onUnconfirmed: () => void
  onConflict: (chosen: RestorableVersion<T>) => void
}) {
  const t = useTranslations(kind)
  const tc = useTranslations('common')
  const locale = useLocale()
  const requestError = useRequestError()
  const applyRevision = useApplyRevision()
  const [open, setOpen] = useState(false)
  const [list, setList] = useState<ListState<T>>({ status: 'loading' })
  const [restoring, setRestoring] = useState<Restoring<T> | null>(null)
  const descriptionId = useId()
  // Muda a cada abertura, ao fechar e ao desmontar: a resposta de antes não vale.
  const generation = useRef(0)
  const loadingMore = useRef(false)
  // Foco ao fechar o Sheet: o botão Histórico; o h1 do editor depois de restaurar;
  // nenhum quando o conflito abre (ele leva o foco).
  const closeFocus = useRef<'trigger' | 'heading' | 'none'>('trigger')
  const sheetRef = useRef<HTMLDivElement>(null)
  const restoreTrigger = useRef<HTMLButtonElement | null>(null)

  useEffect(
    () => () => {
      generation.current++
    },
    []
  )

  const formatDate = useMemo(() => {
    const format = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' })
    return (at: string) => format.format(new Date(at))
  }, [locale])

  const entries = useMemo(
    () => (list.status === 'ready' ? toEntries(list.items, entity.version, diffVersions) : []),
    [list, entity.version, diffVersions]
  )

  const loadFirst = async () => {
    const run = ++generation.current
    loadingMore.current = false
    setList({ status: 'loading' })
    const result = await fetchPage<T>(url, 0)
    if (run !== generation.current) return
    setList(
      result.ok
        ? { status: 'ready', items: result.page.items, total: result.page.total, more: { status: 'idle' } }
        : { status: 'error', code: result.code }
    )
  }

  const loadMore = async () => {
    if (list.status !== 'ready' || loadingMore.current) return
    loadingMore.current = true
    const run = generation.current
    setList({ ...list, more: { status: 'loading' } })
    const result = await fetchPage<T>(url, list.items.length)
    if (run !== generation.current) return
    loadingMore.current = false
    setList((prev) => {
      if (prev.status !== 'ready') return prev
      if (!result.ok) return { ...prev, more: { status: 'error', code: result.code } }
      const items = [...prev.items, ...result.page.items]
      // Página vazia antes do total (o histórico encolheu): vale o que veio.
      const total = result.page.items.length === 0 ? items.length : result.page.total
      return { status: 'ready', items, total, more: { status: 'idle' } }
    })
  }

  const changeOpen = (next: boolean) => {
    if (next) {
      closeFocus.current = 'trigger'
      setOpen(true)
      void loadFirst()
      return
    }
    generation.current++
    setOpen(false)
    setRestoring(null)
  }

  const closeAll = (focus: 'heading' | 'none') => {
    closeFocus.current = focus
    changeOpen(false)
  }

  const confirmRestore = async () => {
    if (!restoring) return
    const { item } = restoring
    setRestoring({ ...restoring, saving: true, rejected: undefined })
    try {
      const response = await fetch(`${url}/history/${item.version}/restore`, {
        method: 'POST',
        headers: { 'If-Match': `"${entity.version}"` }
      })
      const result = response.ok ? await response.json() : null
      if (result?.success) {
        const saved = result.data as T
        const revision = applyRevision(result)
        closeAll('heading')
        onRestored(saved, { status: 'applied', revision, restored: { from: item.version, to: saved.version } })
        return
      }
      if (response.status === 412) {
        closeAll('none')
        onConflict(item)
        return
      }
      const rejection = await errorBody(response)
      const failure = applyFailure(response.status, rejection)
      if (failure?.status === 'not_confirmed') {
        closeAll('heading')
        onUnconfirmed()
        return
      }
      if (response.status === 422) {
        const detail = failure?.status === 'not_applied' ? failure.errorType : rejectedField(422, rejection, anyField)
        setRestoring({ ...restoring, saving: false, rejected: { detail } })
        return
      }
      setRestoring(null)
      if (response.status === 404) {
        toast.error(tc('restoreMissing'))
        void loadFirst()
      } else if (response.status === 409) toast.error(tc('restoreReadOnly'))
      else toast.error(requestError(response.status, { failed: tc('restoreError') }))
    } catch (error) {
      console.error('Error restoring version:', url, error)
      setRestoring(null)
      toast.error(requestError(undefined, { failed: tc('restoreError') }))
    }
  }

  // A confirmação fechou sem restaurar (Cancelar, toast): o foco volta ao Restaurar
  // da linha, ou ao Sheet se a lista recarregou; se já foi para outro lugar (o h1,
  // o conflito, o Salvar), fica.
  const returnFocus = (event: Event) => {
    event.preventDefault()
    const active = document.activeElement
    if (active && active !== document.body) return
    const target = restoreTrigger.current?.isConnected ? restoreTrigger.current : sheetRef.current
    target?.focus()
  }

  const ready = list.status === 'ready' ? list : undefined
  const bold = (chunks: ReactNode) => <b className="font-medium text-foreground">{chunks}</b>
  const description =
    ready && ready.total > 0
      ? t.rich('historyDescription', { name, count: ready.total, b: bold })
      : t.rich('historyDescriptionName', { name, b: bold })

  return (
    <Sheet open={open} onOpenChange={changeOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" className="h-10 sm:h-9">
          <History aria-hidden="true" />
          {tc('history')}
        </Button>
      </SheetTrigger>
      <SheetContent
        ref={sheetRef}
        side="right"
        className="w-full p-0 sm:max-w-lg"
        aria-describedby={descriptionId}
        onCloseAutoFocus={(event) => {
          // A lista sai com o Sheet, depois da animação de saída (reabrir recarrega):
          // salvar ou restaurar com ele fechado não recalcula as linhas lidas.
          setList({ status: 'loading' })
          if (closeFocus.current === 'trigger') return
          event.preventDefault()
          if (closeFocus.current === 'heading') document.querySelector<HTMLElement>('h1')?.focus()
        }}
      >
        <header className="flex flex-col gap-1 border-b border-border px-4 pb-3 pr-12 pt-4 sm:px-6 sm:pr-12">
          <SheetTitle>{tc('historyTitle')}</SheetTitle>
          <p id={descriptionId} className="text-sm text-muted-foreground">
            {description}
          </p>
        </header>
        <SheetClose asChild>
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-2 top-2 size-11 text-muted-foreground"
            aria-label={tc('close')}
          >
            <X aria-hidden="true" />
          </Button>
        </SheetClose>
        <div
          aria-busy={list.status === 'loading'}
          className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-4 sm:px-6"
        >
          {list.status === 'loading' && (
            <>
              <span className="sr-only">{tc('historyLoading')}</span>
              {Array.from({ length: SKELETON_ROWS }, (_, index) => (
                <Skeleton key={index} className="h-[76px]" />
              ))}
            </>
          )}
          {list.status === 'error' && (
            <div role="alert" className="flex flex-col items-center gap-2 px-4 py-8 text-center">
              <AlertCircle aria-hidden="true" className="size-5 text-destructive" />
              <h3 className="text-base font-semibold">{tc('historyLoadError')}</h3>
              <p className="text-sm text-muted-foreground">
                {list.code === undefined
                  ? tc('historyLoadErrorNoCode')
                  : tc('historyLoadErrorDetail', { status: list.code })}
              </p>
              <Button variant="outline" className="h-10 sm:h-9" onClick={() => void loadFirst()}>
                {tc('retry')}
              </Button>
            </div>
          )}
          {ready && ready.items.length === 0 && (
            <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
              <History aria-hidden="true" className="size-5 text-muted-foreground" />
              <h3 className="text-base font-semibold">{tc('historyEmptyTitle')}</h3>
              <p className="max-w-[44ch] text-sm text-muted-foreground">{tc('historyEmpty')}</p>
            </div>
          )}
          {ready && ready.items.length > 0 && (
            <>
              <ul aria-label={tc('historyList')} className="divide-y divide-border rounded-md border border-border">
                {entries.map((entry, index) => (
                  <VersionRow
                    // A lista só cresce no fim; o número da versão pode repetir.
                    key={index}
                    entry={entry}
                    formatDate={formatDate}
                    onRestore={(trigger) => {
                      if (!entry.item.document) return
                      restoreTrigger.current = trigger
                      setRestoring({
                        item: { ...entry.item, document: entry.item.document },
                        rows: diffVersions(entity, entry.item.document),
                        saving: false
                      })
                    }}
                  />
                ))}
              </ul>
              <div className="flex flex-col items-center gap-2">
                {ready.more.status === 'error' && (
                  <p role="alert" className="text-sm text-destructive">
                    {ready.more.code === undefined
                      ? tc('historyMoreErrorNoCode')
                      : tc('historyMoreError', { status: ready.more.code })}
                  </p>
                )}
                {ready.items.length < ready.total && (
                  <Button
                    variant="outline"
                    className="h-11 sm:h-9"
                    disabled={ready.more.status === 'loading'}
                    onClick={() => void loadMore()}
                  >
                    {ready.more.status === 'error' ? tc('retry') : tc('historyLoadMore')}
                  </Button>
                )}
                <p role="status" className="text-xs text-muted-foreground">
                  {ready.items.length < ready.total
                    ? tc('historyCount', { shown: ready.items.length, total: ready.total })
                    : tc('historyEnd', { shown: ready.items.length, total: ready.total })}
                </p>
              </div>
            </>
          )}
        </div>
        {restoring && (
          <RestoreDialog
            version={restoring.item.version}
            current={entity.version}
            date={formatDate(restoring.item.at)}
            rows={restoring.rows}
            dirty={isDirty}
            saving={restoring.saving}
            rejected={restoring.rejected}
            onClose={() => setRestoring(null)}
            onConfirm={() => void confirmRestore()}
            onCloseAutoFocus={returnFocus}
          />
        )}
      </SheetContent>
    </Sheet>
  )
}
