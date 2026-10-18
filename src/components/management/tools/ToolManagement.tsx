'use client'

import { useCallback, useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Plus, Search, Edit, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tool, ToolFilters } from '@/types/management'
import { DeleteConfirmDialog } from '../common/DeleteConfirmDialog'
import { useRequestError } from '../common/useRequestError'
import {
  CardListSkeleton,
  EmptyState,
  FilterEmptyState,
  LoadErrorState
} from '@/components/ui/loading'
import { StatusBadge } from '@/components/ui/status-badge'
import { cn, focusRing } from '@/lib/utils'

export function ToolManagement() {
  const [tools, setTools] = useState<Tool[]>([])
  const [loading, setLoading] = useState(true)
  // Falha da carga: status HTTP, ou sem status quando não houve resposta.
  const [loadError, setLoadError] = useState<{ status?: number } | null>(null)
  const [deletingTool, setDeletingTool] = useState<Tool | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [filters, _setFilters] = useState<ToolFilters>({})
  const [searchTerm, setSearchTerm] = useState('')
  const t = useTranslations('tools')
  const tc = useTranslations('common')
  const requestError = useRequestError()
  const searchRef = useRef<HTMLInputElement>(null)

  // Só a requisição mais recente escreve no estado: a resposta lenta de uma
  // busca anterior (ou de uma falha) não sobrescreve a nova.
  const requestId = useRef(0)

  // Buscar tools; o "Tentar de novo" usa o retorno (deu certo?).
  const fetchTools = useCallback(async (): Promise<boolean> => {
    const id = ++requestId.current
    const isCurrent = () => id === requestId.current
    try {
      const params = new URLSearchParams()
      
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

  // Deletar tool
  const handleDeleteTool = async (tool: Tool) => {
    try {
      const response = await fetch(`/api/tools/${encodeURIComponent(tool.id)}`, {
        method: 'DELETE'
      })
      
      const data = response.ok ? await response.json() : null

      if (data?.success) {
        toast.success(t('deleted'))
        fetchTools()
      } else {
        toast.error(
          requestError(response.status, {
            failed: t('deleteError'),
            notFound: t('notFound')
          })
        )
      }
    } catch (error) {
      console.error('Error deleting tool:', error)
      toast.error(requestError(undefined, { failed: t('deleteError') }))
    } finally {
      setDeletingTool(null)
    }
  }

  // Efeitos
  useEffect(() => {
    setLoading(true)
    setLoadError(null)
    fetchTools()
  }, [fetchTools])

  return (
    <div>
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 tabIndex={-1} className="text-2xl font-semibold tracking-tight focus:outline-none">
              {t('title')}
            </h1>
            <p className="text-muted-foreground">
              {t('subtitle')}
            </p>
          </div>
          <Button asChild className="gap-2">
            <Link href="/tools/new">
              <Plus className="w-4 h-4" aria-hidden="true" />
              {t('form.newTitle')}
            </Link>
          </Button>
        </div>

      {/* Filtros e Busca */}
      <Card>
        <CardHeader>
          <CardTitle>{tc('filters')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
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
        <CardListSkeleton label={t('loadingList')} />
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {tools.map((tool) => (
            <Card key={tool.id} className="relative">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="space-y-2">
                    <CardTitle>
                      <Link
                        href={`/tools/${encodeURIComponent(tool.id)}`}
                        className={cn('rounded-sm hover:underline', focusRing)}
                      >
                        {tool.name}
                      </Link>
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      <span className="rounded-md border border-border bg-muted px-2 py-1 font-mono text-xs">
                        {tool.http_method || tool.http_config?.method || tc('notAvailable')}
                      </span>
                      {tool.active !== undefined && (
                        <StatusBadge active={tool.active}>
                          {tool.active ? t('active') : t('inactive')}
                        </StatusBadge>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" asChild>
                      <Link
                        href={`/tools/${encodeURIComponent(tool.id)}`}
                        aria-label={t('editLabel')}
                      >
                        <Edit className="w-4 h-4" aria-hidden="true" />
                      </Link>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeletingTool(tool)}
                      aria-label={t('deleteLabel')}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription className="mb-4">
                  {tool.description || tc('noDescription')}
                </CardDescription>
                <div className="space-y-2 text-sm">
                  <div>
                    <span className="font-medium">{t('idField')}</span> {tool.id}
                  </div>
                  <div>
                    <span className="font-medium">{t('routeField')}</span> 
                    <span className="break-all">
                      {tool.route || (tool.http_config ? `${tool.http_config.base_url}${tool.http_config.endpoint}` : tc('notAvailable'))}
                    </span>
                  </div>
                  {tool.instructions && (
                    <div>
                      <span className="font-medium">{t('instructionsField')}</span> 
                      <span className="text-muted-foreground">{tool.instructions}</span>
                    </div>
                  )}
                  <div>
                    <span className="font-medium">{t('parametersField')}</span> {tool.parameters?.length || tool.http_config?.parameters?.length || 0}
                  </div>
                  <div>
                    <span className="font-medium">{t('headersField')}</span> {Object.keys(tool.headers || tool.http_config?.headers || {}).length}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Dialog de confirmação de exclusão */}
      <DeleteConfirmDialog
        open={!!deletingTool}
        onOpenChange={() => setDeletingTool(null)}
        title={t('deleteTitle')}
        description={t('deleteDescription', { name: deletingTool?.name ?? '' })}
        onConfirm={() => deletingTool && handleDeleteTool(deletingTool)}
      />
      </div>
    </div>
  )
}
