'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Plus, Search, Filter, Edit, Trash2, Bot } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { AgentConfig, AgentFilters } from '@/types/management'
import { DeleteConfirmDialog } from '../common/DeleteConfirmDialog'
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
      const data = await response.json()

      if (data.success) {
        setAgents(data.data.data)
      } else {
        toast.error(data.error || 'Erro ao carregar agentes')
      }
    } catch (error) {
      console.error('Error fetching agents:', error)
      toast.error('Erro ao carregar agentes')
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
      
      const data = await response.json()
      
      if (data.success) {
        toast.success('Agente deletado com sucesso')
        fetchAgents()
      } else {
        toast.error(data.error || 'Erro ao deletar agente')
      }
    } catch (error) {
      console.error('Error deleting agent:', error)
      toast.error('Erro ao deletar agente')
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
              Gerenciamento de Agentes
            </h1>
            <p className="text-sm text-muted-foreground lg:text-base">
              Crie e gerencie seus agentes de IA
            </p>
          </div>
          <Button asChild className="w-full gap-2 lg:w-auto">
            <Link href="/agents/new">
              <Plus className="w-4 h-4" aria-hidden="true" />
              Novo Agente
            </Link>
          </Button>
        </div>

      {/* Filtros e Busca */}
      <Card>
        <CardHeader className="p-4 pb-2 lg:p-6">
          <div className="flex flex-col items-start gap-2 lg:flex-row lg:items-center lg:justify-between">
            <CardTitle>
              Filtros
            </CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
              className="text-xs lg:hidden"
            >
              <Filter className="w-3 h-3 mr-1" />
              {showFilters ? 'Ocultar' : 'Mostrar'} Filtros
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
                Buscar
              </Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="search"
                  placeholder="ID, nome ou descrição..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="active-only">Apenas ativos</Label>
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
                  Mostrar apenas agentes ativos
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Lista de Agentes */}
      {loading ? (
        <LoadingSpinner text="Carregando agentes..." />
      ) : agents.length === 0 ? (
        <EmptyState
          title="Nenhum agente encontrado"
          description="Crie seu primeiro agente para começar a usar o sistema de orquestração de IA"
          action={
            <Button asChild className="gap-2">
              <Link href="/agents/new">
                <Plus className="w-4 h-4" aria-hidden="true" />
                Criar primeiro agente
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
                        {agent.active ? 'Ativo' : 'Inativo'}
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
                      <Link href={`/agents/${encodeURIComponent(agent.id)}`} aria-label="Editar agente">
                        <Edit className="w-4 h-4" aria-hidden="true" />
                        <span className="text-xs lg:hidden">Editar</span>
                      </Link>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeletingAgent(agent)}
                      className="flex-1 lg:flex-none"
                      aria-label="Excluir agente"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span className="text-xs lg:hidden">Excluir</span>
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-4 pt-0 lg:p-6 lg:pt-0">
                <CardDescription className="mb-4 text-xs lg:text-sm">
                  {agent.descricao || 'Sem descrição'}
                </CardDescription>
                <div className="space-y-2 text-xs lg:text-sm">
                  <div className="truncate lg:whitespace-normal">
                    <span className="font-medium">ID:</span> {agent.id}
                  </div>
                  <div>
                    <span className="font-medium">Modelo:</span> {agent.model}
                  </div>
                  <div>
                    <span className="font-medium">Tools:</span> {agent.tools_ids.length}
                  </div>
                  {agent.rag_config?.active && (
                    <div>
                      <span className="font-medium">RAG:</span> Ativo
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
        title="Deletar Agente"
        description={`Tem certeza que deseja deletar o agente "${deletingAgent?.nome}"? Esta ação não pode ser desfeita.`}
        onConfirm={() => deletingAgent && handleDeleteAgent(deletingAgent)}
      />
      </div>
    </div>
  )
}
