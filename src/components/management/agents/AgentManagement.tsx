'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Plus, Search, Filter, Edit, Trash2, Bot } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { AgentConfig, AgentFilters } from '@/types/management'
import { DeleteConfirmDialog } from '../common/DeleteConfirmDialog'
import { useRequestError } from '../common/useRequestError'
import { LoadingSpinner, EmptyState } from '@/components/ui/loading'
import { cn, focusRing } from '@/lib/utils'
import { StatusBadge } from '@/components/ui/status-badge'

export function AgentManagement() {
  const [agents, setAgents] = useState<AgentConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [deletingAgent, setDeletingAgent] = useState<AgentConfig | null>(null)
  const [filters, setFilters] = useState<AgentFilters>({})
  const [searchTerm, setSearchTerm] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const t = useTranslations('agents')
  const tc = useTranslations('common')
  const requestError = useRequestError()

  // Buscar agentes
  const fetchAgents = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      
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

      if (data?.success) {
        setAgents(data.data.data)
      } else {
        toast.error(requestError(response.status, { failed: t('listError') }))
      }
    } catch (error) {
      console.error('Error fetching agents:', error)
      toast.error(requestError(undefined, { failed: t('listError') }))
    } finally {
      setLoading(false)
    }
  }

  // Deletar agente
  const handleDeleteAgent = async (agent: AgentConfig) => {
    try {
      const response = await fetch(`/api/agents/${encodeURIComponent(agent.id)}`, {
        method: 'DELETE'
      })
      
      const data = response.ok ? await response.json() : null

      if (data?.success) {
        toast.success(t('deleted'))
        fetchAgents()
      } else {
        toast.error(
          requestError(response.status, {
            failed: t('deleteError'),
            notFound: t('notFound')
          })
        )
      }
    } catch (error) {
      console.error('Error deleting agent:', error)
      toast.error(requestError(undefined, { failed: t('deleteError') }))
    } finally {
      setDeletingAgent(null)
    }
  }

  // Efeitos
  useEffect(() => {
    fetchAgents()
  }, [filters, searchTerm])

  return (
    <div>
      <div className="mx-auto max-w-7xl space-y-6 p-4 lg:p-6">
        {/* Header */}
        <div className="flex flex-col items-start gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="w-full lg:w-auto">
            <h1 className="text-2xl font-semibold tracking-tight">
              {t('title')}
            </h1>
            <p className="text-sm text-muted-foreground lg:text-base">
              {t('subtitle')}
            </p>
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
        <LoadingSpinner text={t('loadingList')} />
      ) : agents.length === 0 ? (
        <EmptyState
          title={t('emptyTitle')}
          description={t('emptyDescription')}
          action={
            <Button asChild className="gap-2">
              <Link href="/agents/new">
                <Plus className="w-4 h-4" aria-hidden="true" />
                {t('createFirst')}
              </Link>
            </Button>
          }
          icon={<Bot className="w-full h-full" />}
        />
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {agents.map((agent) => (
            <Card key={agent.id} className="relative">
              <CardHeader className="p-4 lg:p-6">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-2 flex-1 min-w-0">
                    <CardTitle>
                      <Link href={`/agents/${encodeURIComponent(agent.id)}`} className={cn('rounded-sm hover:underline', focusRing)}>
                        {agent.nome}
                      </Link>
                    </CardTitle>
                    <div className="flex flex-wrap gap-2">
                      <StatusBadge active={agent.active}>
                        {agent.active ? t('active') : t('inactive')}
                      </StatusBadge>
                      <span className="rounded-md border border-border bg-muted px-2 py-1 font-mono text-xs">
                        {agent.factoryIaModel}
                      </span>
                    </div>
                  </div>
                  <div className="flex w-full justify-end gap-1 lg:w-auto lg:shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      asChild
                      className="flex-1 lg:flex-none"
                    >
                      <Link href={`/agents/${encodeURIComponent(agent.id)}`} aria-label={t('editLabel')}>
                        <Edit className="w-4 h-4" aria-hidden="true" />
                        <span className="text-xs lg:hidden">{tc('edit')}</span>
                      </Link>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeletingAgent(agent)}
                      className="flex-1 lg:flex-none"
                      aria-label={t('deleteLabel')}
                    >
                      <Trash2 className="w-4 h-4" />
                      <span className="text-xs lg:hidden">{tc('delete')}</span>
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-4 pt-0 lg:p-6 lg:pt-0">
                <CardDescription className="mb-4 text-xs lg:text-sm">
                  {agent.descricao || tc('noDescription')}
                </CardDescription>
                <div className="space-y-2 text-xs lg:text-sm">
                  <div className="truncate lg:whitespace-normal">
                    <span className="font-medium">{t('idField')}</span> {agent.id}
                  </div>
                  <div>
                    <span className="font-medium">{t('modelField')}</span> {agent.model}
                  </div>
                  <div>
                    <span className="font-medium">{t('toolsField')}</span> {agent.tools_ids.length}
                  </div>
                  {agent.rag_config?.active && (
                    <div>
                      <span className="font-medium">{t('ragField')}</span> {t('active')}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Dialog de confirmação de exclusão */}
      <DeleteConfirmDialog
        open={!!deletingAgent}
        onOpenChange={() => setDeletingAgent(null)}
        title={t('deleteTitle')}
        description={t('deleteDescription', { name: deletingAgent?.nome ?? '' })}
        onConfirm={() => deletingAgent && handleDeleteAgent(deletingAgent)}
      />
      </div>
    </div>
  )
}
