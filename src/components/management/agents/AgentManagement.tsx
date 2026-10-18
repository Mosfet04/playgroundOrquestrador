'use client'

import { useCallback, useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { ChevronRight, Plus, Search, Filter } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Table, TableCell, TableHead, TableRow } from '@/components/ui/table'
import { AgentConfig, AgentFilters } from '@/types/management'
import { CountChips, listCounts, rowLinkClass, ShowingOf, UpdatedAt } from '../common/EntityList'
import {
  Chip,
  EmptyState,
  FilterEmptyState,
  ListSkeleton,
  LoadErrorState
} from '@/components/ui/loading'
import { cn } from '@/lib/utils'
import { StatusBadge } from '@/components/ui/status-badge'

const SEPARATOR = ' · '

// Avatar de 28 px com as iniciais: gradiente da marca; inativo em `secondary`.
function AgentAvatar({ agent }: { agent: AgentConfig }) {
  const initials = agent.nome
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => Array.from(word)[0])
    .join('')
    .toUpperCase()
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex size-7 shrink-0 items-center justify-center rounded-sm font-mono text-xs font-medium',
        agent.active
          ? 'bg-gradient-to-br from-primary to-signal text-primary-foreground'
          : 'bg-secondary text-secondary-foreground'
      )}
    >
      {initials}
    </span>
  )
}

export function AgentManagement() {
  const [agents, setAgents] = useState<AgentConfig[]>([])
  // Total do filtro no BFF; a página traz no máximo 100 (decisão 0014).
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  // Falha da carga: status HTTP, ou sem status quando não houve resposta.
  const [loadError, setLoadError] = useState<{ status?: number } | null>(null)
  const [filters, setFilters] = useState<AgentFilters>({})
  const [searchTerm, setSearchTerm] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const t = useTranslations('agents')
  const tc = useTranslations('common')
  const searchRef = useRef<HTMLInputElement>(null)

  // Só a requisição mais recente escreve no estado: a resposta lenta de uma
  // busca anterior (ou de uma falha) não sobrescreve a nova.
  const requestId = useRef(0)

  // Buscar agentes; o "Tentar de novo" usa o retorno (deu certo?).
  const fetchAgents = useCallback(async (): Promise<boolean> => {
    const id = ++requestId.current
    const isCurrent = () => id === requestId.current
    try {
      const params = new URLSearchParams({ limit: '100' })

      if (filters.active !== undefined) {
        params.append('active', filters.active.toString())
      }
      if (filters.factoryIaModel) {
        params.append('factoryIaModel', filters.factoryIaModel)
      }
      if (searchTerm) {
        params.append('search', searchTerm)
      }

      const response = await fetch(`/api/agents?${params.toString()}`)
      const data = response.ok ? await response.json() : null
      if (!isCurrent()) return false

      if (data?.success) {
        setAgents(data.data.data)
        setTotal(data.data.total)
        setLoadError(null)
        return true
      }
      setLoadError({ status: response.status })
    } catch (error) {
      console.error('Error fetching agents:', error)
      if (isCurrent()) setLoadError({})
    } finally {
      if (isCurrent()) setLoading(false)
    }
    return false
  }, [filters, searchTerm])

  const clearFilters = () => {
    setSearchTerm('')
    setFilters({})
    searchRef.current?.focus()
  }

  const hasContent = !loading && !loadError && agents.length > 0
  const agentHref = (agent: AgentConfig) => `/agents/${encodeURIComponent(agent.id)}`
  const modelOf = (agent: AgentConfig) => `${agent.factoryIaModel}/${agent.model}`
  const head = (
    <TableRow>
      <TableHead>{t('columnAgent')}</TableHead>
      <TableHead>{t('columnModel')}</TableHead>
      <TableHead className="text-right">{t('columnTools')}</TableHead>
      <TableHead>{tc('status')}</TableHead>
      <TableHead>{tc('updated')}</TableHead>
      <TableHead className="w-9">
        <span className="sr-only">{tc('open')}</span>
      </TableHead>
    </TableRow>
  )

  // Efeitos
  useEffect(() => {
    setLoading(true)
    setLoadError(null)
    fetchAgents()
  }, [fetchAgents])

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
              namespace="agents"
              counts={hasContent ? listCounts(agents, total, filters.active) : undefined}
            />
          </div>
          <Button asChild className="w-full gap-2 lg:w-auto">
            <Link href="/agents/new">
              <Plus className="w-4 h-4" aria-hidden="true" />
              {t('form.newTitle')}
            </Link>
          </Button>
        </div>

      {/* Filtros e Busca */}
      <Card>
        <CardHeader className="p-4 pb-2 lg:p-6">
          <div className="flex flex-col items-start gap-2 lg:flex-row lg:items-center lg:justify-between">
            <CardTitle>
              {tc('filters')}
            </CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
              className="text-xs lg:hidden"
            >
              <Filter className="w-3 h-3 mr-1" />
              {showFilters ? t('hideFilters') : t('showFilters')}
            </Button>
          </div>
        </CardHeader>
        <CardContent className={cn(
          "space-y-4 p-4 pt-0 lg:block lg:p-6 lg:pt-0",
          !showFilters && "hidden"
        )}>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="search">
                {tc('search')}
              </Label>
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
            
            <div className="space-y-2">
              <Label htmlFor="active-only">{t('activeOnly')}</Label>
              <div className="flex items-center space-x-2">
                <Switch
                  id="active-only"
                  checked={filters.active === true}
                  onCheckedChange={(checked) => 
                    setFilters(prev => ({ 
                      ...prev, 
                      active: checked ? true : undefined 
                    }))
                  }
                />
                <span className="text-sm text-muted-foreground">
                  {t('activeOnlyHint')}
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Lista de Agentes */}
      {loading ? (
        <ListSkeleton label={t('loadingList')} head={head} chipClassName="w-28" />
      ) : loadError ? (
        <LoadErrorState
          title={t('listError')}
          status={loadError.status}
          onRetry={fetchAgents}
        />
      ) : agents.length === 0 && (searchTerm || filters.active) ? (
        <FilterEmptyState
          title={
            searchTerm
              ? t.rich('searchEmptyTitle', {
                  query: searchTerm,
                  term: (chunks) => <span className="font-mono">{chunks}</span>
                })
              : t('activeEmptyTitle')
          }
          hint={tc('filterEmptyHint')}
          action={
            <Button variant="outline" onClick={clearFilters}>
              {tc('clearFilters')}
            </Button>
          }
        />
      ) : agents.length === 0 ? (
        <EmptyState
          title={t('emptyTitle')}
          description={t('emptyDescription')}
          actions={
            <>
              <Button asChild>
                <Link href="/agents/new">
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
                {agents.map((agent) => (
                  <TableRow key={agent.id} className="group relative hover:bg-muted/50">
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <AgentAvatar agent={agent} />
                        <div className="flex min-w-0 flex-col">
                          <Link href={agentHref(agent)} className={rowLinkClass}>
                            {agent.nome}
                          </Link>
                          <span className="font-mono text-xs text-muted-foreground">
                            {agent.id}
                          </span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Chip>{modelOf(agent)}</Chip>
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {agent.tools_ids.length}
                    </TableCell>
                    <TableCell>
                      <StatusBadge active={agent.active}>
                        {agent.active ? t('active') : t('inactive')}
                      </StatusBadge>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      <UpdatedAt value={agent.updated_at} />
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
            {agents.map((agent) => (
              <li
                key={agent.id}
                className="group relative flex h-16 items-center gap-3 px-3 hover:bg-muted/50"
              >
                <AgentAvatar agent={agent} />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <div className="flex min-w-0 items-center gap-2">
                    <Link href={agentHref(agent)} className={cn(rowLinkClass, 'truncate')}>
                      {agent.nome}
                    </Link>
                    <StatusBadge active={agent.active}>
                      {agent.active ? t('active') : t('inactive')}
                    </StatusBadge>
                  </div>
                  <span className="truncate font-mono text-xs text-muted-foreground">
                    {agent.id + SEPARATOR + modelOf(agent)}
                  </span>
                </div>
                <ChevronRight
                  aria-hidden="true"
                  className="size-4 shrink-0 text-muted-foreground group-hover:text-primary"
                />
              </li>
            ))}
          </ul>
          <ShowingOf shown={agents.length} total={total} />
        </div>
      )}
      </div>
    </div>
  )
}
