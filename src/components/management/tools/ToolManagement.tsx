'use client'

import { useCallback, useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { ChevronRight, Plus, Search, Wrench } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableCell, TableHead, TableRow } from '@/components/ui/table'
import { Tool, ToolFilters } from '@/types/management'
import { CountChips, listCounts, rowLinkClass, ShowingOf, UpdatedAt } from '../common/EntityList'
import {
  Chip,
  EmptyState,
  FilterEmptyState,
  ListSkeleton,
  LoadErrorState
} from '@/components/ui/loading'
import { StatusBadge } from '@/components/ui/status-badge'
import { cn } from '@/lib/utils'

const SEPARATOR = ' · '

// Ícone de chave em quadrado de 28 px `muted` com borda.
function ToolIcon() {
  return (
    <span
      aria-hidden="true"
      className="flex size-7 shrink-0 items-center justify-center rounded-sm border border-border bg-muted text-muted-foreground"
    >
      <Wrench className="size-4" />
    </span>
  )
}

export function ToolManagement() {
  const [tools, setTools] = useState<Tool[]>([])
  // Total do filtro no BFF; a página traz no máximo 100 (decisão 0014).
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  // Falha da carga: status HTTP, ou sem status quando não houve resposta.
  const [loadError, setLoadError] = useState<{ status?: number } | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [filters, _setFilters] = useState<ToolFilters>({})
  const [searchTerm, setSearchTerm] = useState('')
  const t = useTranslations('tools')
  const tc = useTranslations('common')
  const searchRef = useRef<HTMLInputElement>(null)

  // Só a requisição mais recente escreve no estado: a resposta lenta de uma
  // busca anterior (ou de uma falha) não sobrescreve a nova.
  const requestId = useRef(0)

  // Buscar tools; o "Tentar de novo" usa o retorno (deu certo?).
  const fetchTools = useCallback(async (): Promise<boolean> => {
    const id = ++requestId.current
    const isCurrent = () => id === requestId.current
    try {
      const params = new URLSearchParams({ limit: '100' })

      if (filters.method) {
        params.append('method', filters.method)
      }
      if (searchTerm) {
        params.append('search', searchTerm)
      }

      const response = await fetch(`/api/tools?${params.toString()}`)
      const data = response.ok ? await response.json() : null
      if (!isCurrent()) return false

      if (data?.success) {
        setTools(data.data.data)
        setTotal(data.data.total)
        setLoadError(null)
        return true
      }
      setLoadError({ status: response.status })
    } catch (error) {
      console.error('Error fetching tools:', error)
      if (isCurrent()) setLoadError({})
    } finally {
      if (isCurrent()) setLoading(false)
    }
    return false
  }, [filters, searchTerm])

  const clearFilters = () => {
    setSearchTerm('')
    searchRef.current?.focus()
  }

  const hasContent = !loading && !loadError && tools.length > 0
  const toolHref = (tool: Tool) => `/tools/${encodeURIComponent(tool.id)}`
  const head = (
    <TableRow>
      <TableHead>{t('columnTool')}</TableHead>
      <TableHead>{t('columnRequest')}</TableHead>
      <TableHead className="w-24 text-right">{t('columnParameters')}</TableHead>
      <TableHead className="w-28">{tc('status')}</TableHead>
      <TableHead className="w-32">{tc('updated')}</TableHead>
      <TableHead className="w-9">
        <span className="sr-only">{tc('open')}</span>
      </TableHead>
    </TableRow>
  )

  // Efeitos
  useEffect(() => {
    setLoading(true)
    setLoadError(null)
    fetchTools()
  }, [fetchTools])

  return (
    <div>
      <div className="mx-auto max-w-7xl space-y-6 p-4 lg:p-6">
        {/* Header */}
        <div className="flex flex-col items-start gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="w-full lg:w-auto">
            <h1 tabIndex={-1} className="text-2xl font-semibold tracking-tight focus:outline-none">
              {t('title')}
            </h1>
            <p className="text-sm text-muted-foreground lg:text-base">
              {t('subtitle')}
            </p>
            <CountChips
              namespace="tools"
              counts={hasContent ? listCounts(tools, total) : undefined}
            />
          </div>
          <Button asChild className="w-full gap-2 lg:w-auto">
            <Link href="/tools/new">
              <Plus className="w-4 h-4" aria-hidden="true" />
              {t('form.newTitle')}
            </Link>
          </Button>
        </div>

      {/* Filtros e Busca */}
      <Card>
        <CardHeader className="p-4 pb-2 lg:p-6">
          <CardTitle>{tc('filters')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 p-4 pt-0 lg:p-6 lg:pt-0">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="search">{tc('search')}</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  ref={searchRef}
                  id="search"
                  placeholder={tc('searchPlaceholder')}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Lista de Tools */}
      {loading ? (
        <ListSkeleton label={t('loadingList')} head={head} chipClassName="w-40" />
      ) : loadError ? (
        <LoadErrorState
          title={t('listError')}
          status={loadError.status}
          onRetry={fetchTools}
        />
      ) : tools.length === 0 && searchTerm ? (
        <FilterEmptyState
          title={t.rich('searchEmptyTitle', {
            query: searchTerm,
            term: (chunks) => <span className="font-mono">{chunks}</span>
          })}
          hint={tc('filterEmptyHint')}
          action={
            <Button variant="outline" onClick={clearFilters}>
              {tc('clearFilters')}
            </Button>
          }
        />
      ) : tools.length === 0 ? (
        <EmptyState
          title={t('emptyTitle')}
          description={t('emptyDescription')}
          actions={
            <>
              <Button asChild>
                <Link href="/tools/new">
                  <Plus aria-hidden="true" />
                  {t('createFirst')}
                </Link>
              </Button>
              <Button asChild variant="ghost">
                <Link href="/">{tc('gettingStarted')}</Link>
              </Button>
            </>
          }
        />
      ) : (
        <div className="space-y-2">
          <div className="hidden md:block">
            <Table>
              <thead>{head}</thead>
              <tbody>
                {tools.map((tool) => (
                  <TableRow key={tool.id} className="group relative hover:bg-muted/50">
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <ToolIcon />
                        <div className="flex min-w-0 flex-col">
                          <Link href={toolHref(tool)} className={rowLinkClass}>
                            {tool.name}
                          </Link>
                          <span className="font-mono text-xs text-muted-foreground">
                            {tool.id}
                          </span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Chip className="max-w-xs">
                        <span className="font-semibold">{tool.http_method}</span>{' '}
                        <span title={tool.route} className="relative truncate text-muted-foreground">
                          {tool.route}
                        </span>
                      </Chip>
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {tool.parameters?.length || tool.http_config?.parameters?.length || 0}
                    </TableCell>
                    <TableCell>
                      <StatusBadge active={tool.active}>
                        {tool.active ? t('active') : t('inactive')}
                      </StatusBadge>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      <UpdatedAt value={tool.updated_at} />
                    </TableCell>
                    <TableCell>
                      <ChevronRight
                        aria-hidden="true"
                        className="ml-auto size-4 text-muted-foreground group-hover:text-primary"
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </tbody>
            </Table>
          </div>
          <ul className="divide-y divide-border rounded-lg border border-border bg-card md:hidden">
            {tools.map((tool) => (
              <li
                key={tool.id}
                className="group relative flex h-16 items-center gap-3 px-3 hover:bg-muted/50"
              >
                <ToolIcon />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <div className="flex min-w-0 items-center gap-2">
                    <Link href={toolHref(tool)} className={cn(rowLinkClass, 'truncate')}>
                      {tool.name}
                    </Link>
                    <StatusBadge active={tool.active}>
                      {tool.active ? t('active') : t('inactive')}
                    </StatusBadge>
                  </div>
                  <span className="truncate font-mono text-xs text-muted-foreground">
                    {tool.id + SEPARATOR + tool.http_method}
                  </span>
                </div>
                <ChevronRight
                  aria-hidden="true"
                  className="size-4 shrink-0 text-muted-foreground group-hover:text-primary"
                />
              </li>
            ))}
          </ul>
          <ShowingOf shown={tools.length} total={total} />
        </div>
      )}
      </div>
    </div>
  )
}
