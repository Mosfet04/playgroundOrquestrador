'use client'

import { useCallback, useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { ChevronRight, Plus, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Table, TableCell, TableHead, TableRow } from '@/components/ui/table'
import { TeamConfig } from '@/types/management'
import { CountChips, listCounts, rowLinkClass, ShowingOf, UpdatedAt } from '../common/EntityList'
import { ListAvatar } from '../common/ListAvatar'
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

export function TeamManagement() {
  const [teams, setTeams] = useState<TeamConfig[]>([])
  // Total do filtro no BFF; a página traz no máximo 100 (decisão 0014).
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  // Falha da carga: status HTTP, ou sem status quando não houve resposta.
  const [loadError, setLoadError] = useState<{ status?: number } | null>(null)
  const [filters, setFilters] = useState<{ active?: boolean }>({})
  const [searchTerm, setSearchTerm] = useState('')
  const t = useTranslations('teams')
  const tc = useTranslations('common')
  const searchRef = useRef<HTMLInputElement>(null)

  // Só a requisição mais recente escreve no estado: a resposta lenta de uma
  // busca anterior (ou de uma falha) não sobrescreve a nova.
  const requestId = useRef(0)

  // Buscar teams; o "Tentar de novo" usa o retorno (deu certo?).
  const fetchTeams = useCallback(async (): Promise<boolean> => {
    const id = ++requestId.current
    const isCurrent = () => id === requestId.current
    try {
      const params = new URLSearchParams({ limit: '100' })

      if (filters.active !== undefined) {
        params.append('active', filters.active.toString())
      }
      if (searchTerm) {
        params.append('search', searchTerm)
      }

      const response = await fetch(`/api/teams?${params.toString()}`)
      const data = response.ok ? await response.json() : null
      if (!isCurrent()) return false

      if (data?.success) {
        setTeams(data.data.data)
        setTotal(data.data.total)
        setLoadError(null)
        return true
      }
      setLoadError({ status: response.status })
    } catch (error) {
      console.error('Error fetching teams:', error)
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

  const hasContent = !loading && !loadError && teams.length > 0
  const teamHref = (team: TeamConfig) => `/teams/${encodeURIComponent(team.id)}`
  const modelOf = (team: TeamConfig) => `${team.factoryIaModel}/${team.model}`
  const head = (
    <TableRow>
      <TableHead>{t('columnTeam')}</TableHead>
      <TableHead>{t('columnModel')}</TableHead>
      <TableHead>{t('columnMode')}</TableHead>
      <TableHead className="w-24 text-right">{t('columnMembers')}</TableHead>
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
    fetchTeams()
  }, [fetchTeams])

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
              namespace="teams"
              counts={hasContent ? listCounts(teams, total, filters.active) : undefined}
            />
          </div>
          <Button asChild className="w-full gap-2 lg:w-auto">
            <Link href="/teams/new">
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
        <ListSkeleton label={t('loadingList')} head={head} chipClassName="w-28" extraChipColumns={1} />
      ) : loadError ? (
        <LoadErrorState
          title={t('listError')}
          status={loadError.status}
          onRetry={fetchTeams}
        />
      ) : teams.length === 0 && (searchTerm || filters.active) ? (
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
      ) : teams.length === 0 ? (
        <EmptyState
          title={t('emptyTitle')}
          description={t('emptyDescription')}
          actions={
            <>
              <Button asChild>
                <Link href="/teams/new">
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
                {teams.map((team) => (
                  <TableRow key={team.id} className="group relative hover:bg-muted/50">
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <ListAvatar name={team.nome} active={team.active} />
                        <div className="flex min-w-0 flex-col">
                          <Link href={teamHref(team)} className={rowLinkClass}>
                            {team.nome}
                          </Link>
                          <span className="font-mono text-xs text-muted-foreground">
                            {team.id}
                          </span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Chip>{modelOf(team)}</Chip>
                    </TableCell>
                    <TableCell>
                      <Chip>{team.mode}</Chip>
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {team.member_ids.length}
                    </TableCell>
                    <TableCell>
                      <StatusBadge active={team.active}>
                        {team.active ? t('active') : t('inactive')}
                      </StatusBadge>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      <UpdatedAt value={team.updated_at} />
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
            {teams.map((team) => (
              <li
                key={team.id}
                className="group relative flex h-16 items-center gap-3 px-3 hover:bg-muted/50"
              >
                <ListAvatar name={team.nome} active={team.active} />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <div className="flex min-w-0 items-center gap-2">
                    <Link href={teamHref(team)} className={cn(rowLinkClass, 'truncate')}>
                      {team.nome}
                    </Link>
                    <StatusBadge active={team.active}>
                      {team.active ? t('active') : t('inactive')}
                    </StatusBadge>
                  </div>
                  <span className="truncate font-mono text-xs text-muted-foreground">
                    {team.id + SEPARATOR + t('membersCount', { count: team.member_ids.length })}
                  </span>
                </div>
                <ChevronRight
                  aria-hidden="true"
                  className="size-4 shrink-0 text-muted-foreground group-hover:text-primary"
                />
              </li>
            ))}
          </ul>
          <ShowingOf shown={teams.length} total={total} />
        </div>
      )}
      </div>
    </div>
  )
}
