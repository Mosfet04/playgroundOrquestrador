'use client'

import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Plus, Search, Filter, Edit, Trash2, Bot, Smartphone } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { AgentConfig, AgentFilters } from '@/types/management'
import { AgentForm } from './AgentForm'
import { DeleteConfirmDialog } from '../common/DeleteConfirmDialog'
import { LoadingSpinner, EmptyState } from '@/components/ui/loading'
import { cn } from '@/lib/utils'

export function AgentManagement() {
  const [agents, setAgents] = useState<AgentConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingAgent, setEditingAgent] = useState<AgentConfig | null>(null)
  const [deletingAgent, setDeletingAgent] = useState<AgentConfig | null>(null)
  const [filters, setFilters] = useState<AgentFilters>({})
  const [searchTerm, setSearchTerm] = useState('')
  const [isMobile, setIsMobile] = useState(false)
  const [showFilters, setShowFilters] = useState(false)

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768)
    }
    
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

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
      const response = await fetch(`/api/agents/${agent.id}`, {
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

  const handleFormSuccess = () => {
    setShowForm(false)
    setEditingAgent(null)
    fetchAgents()
  }

  const handleEditAgent = (agent: AgentConfig) => {
    setEditingAgent(agent)
    setShowForm(true)
  }

  if (showForm) {
    return (
      <AgentForm
        agent={editingAgent}
        onSuccess={handleFormSuccess}
        onCancel={() => {
          setShowForm(false)
          setEditingAgent(null)
        }}
      />
    )
  }

  return (
    <div className="management-form">
      <div className={cn(
        "mx-auto space-y-6 max-w-7xl",
        isMobile ? "p-4" : "p-6"
      )}>
        {/* Header */}
        <div className={cn(
          "flex items-center justify-between",
          isMobile && "flex-col space-y-4 items-start"
        )}>
          <div className={isMobile ? "w-full" : ""}>
            <h1 className={cn(
              "font-bold",
              isMobile ? "text-xl" : "text-3xl"
            )}>
              Gerenciamento de Agentes
            </h1>
            <p className={cn(
              "text-muted-foreground",
              isMobile ? "text-sm" : ""
            )}>
              Crie e gerencie seus agentes de IA
            </p>
          </div>
          <Button 
            onClick={() => setShowForm(true)} 
            className={cn(
              "gap-2 text-black",
              isMobile && "w-full"
            )}
            size={isMobile ? "sm" : "default"}
          >
            <Plus className="w-4 h-4" />
            Novo Agente
          </Button>
        </div>

      {/* Filtros e Busca */}
      <Card>
        <CardHeader className={isMobile ? "p-4 pb-2" : ""}>
          <div className={cn(
            "flex items-center justify-between",
            isMobile && "flex-col items-start space-y-2"
          )}>
            <CardTitle className={cn(
              isMobile ? "text-base" : "text-lg"
            )}>
              Filtros
            </CardTitle>
            {isMobile && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowFilters(!showFilters)}
                className="text-xs"
              >
                <Filter className="w-3 h-3 mr-1" />
                {showFilters ? 'Ocultar' : 'Mostrar'} Filtros
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className={cn(
          "space-y-4",
          isMobile ? "p-4 pt-0" : "",
          isMobile && !showFilters && "hidden"
        )}>
          <div className={cn(
            "grid gap-4",
            isMobile ? "grid-cols-1" : "grid-cols-1 md:grid-cols-3"
          )}>
            <div className="space-y-2">
              <Label htmlFor="search" className={isMobile ? "text-sm" : ""}>
                Buscar
              </Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="search"
                  placeholder={isMobile ? "ID, nome..." : "ID, nome ou descrição..."}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className={cn(
                    "pl-10",
                    isMobile && "text-sm h-9"
                  )}
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label>Apenas ativos</Label>
              <div className="flex items-center space-x-2">
                <Switch
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
          description={
            isMobile 
              ? "Crie seu primeiro agente" 
              : "Crie seu primeiro agente para começar a usar o sistema de orquestração de IA"
          }
          action={
            <Button 
              onClick={() => setShowForm(true)} 
              className="gap-2"
              size={isMobile ? "sm" : "default"}
            >
              <Plus className="w-4 h-4" />
              Criar primeiro agente
            </Button>
          }
          icon={<Bot className="w-full h-full" />}
        />
      ) : (
        <div className={cn(
          "grid gap-6",
          isMobile ? "grid-cols-1" : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
        )}>
          {agents.map((agent) => (
            <Card key={agent.id} className="relative">
              <CardHeader className={isMobile ? "p-4" : ""}>
                <div className={cn(
                  "flex justify-between",
                  isMobile ? "flex-col space-y-3" : "items-start"
                )}>
                  <div className="space-y-2 flex-1 min-w-0">
                    <CardTitle className={cn(
                      isMobile ? "text-base" : "text-lg"
                    )}>
                      {agent.nome}
                    </CardTitle>
                    <div className={cn(
                      "flex gap-2",
                      isMobile && "flex-wrap"
                    )}>
                      <span className={cn(
                        "px-2 py-1 rounded-full font-medium",
                        isMobile ? "text-xs" : "text-xs",
                        agent.active 
                          ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                          : 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
                      )}>
                        {agent.active ? 'Ativo' : 'Inativo'}
                      </span>
                      <span className={cn(
                        "px-2 py-1 bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 rounded-full font-medium",
                        isMobile ? "text-xs" : "text-xs"
                      )}>
                        {isMobile ? agent.factoryIaModel.substring(0, 8) + '...' : agent.factoryIaModel}
                      </span>
                    </div>
                  </div>
                  <div className={cn(
                    "flex gap-1",
                    isMobile ? "w-full justify-end" : "flex-shrink-0"
                  )}>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEditAgent(agent)}
                      className={isMobile ? "flex-1" : ""}
                    >
                      <Edit className="w-4 h-4" />
                      {isMobile && <span className="ml-1 text-xs">Editar</span>}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeletingAgent(agent)}
                      className={isMobile ? "flex-1" : ""}
                    >
                      <Trash2 className="w-4 h-4" />
                      {isMobile && <span className="ml-1 text-xs">Excluir</span>}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className={isMobile ? "p-4 pt-0" : ""}>
                <CardDescription className={cn(
                  "mb-4",
                  isMobile ? "text-xs" : ""
                )}>
                  {agent.descricao || 'Sem descrição'}
                </CardDescription>
                <div className={cn(
                  "space-y-2",
                  isMobile ? "text-xs" : "text-sm"
                )}>
                  <div className={isMobile ? "truncate" : ""}>
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
