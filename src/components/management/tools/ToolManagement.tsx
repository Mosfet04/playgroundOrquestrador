'use client'

import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Plus, Search, Edit, Trash2, Wrench } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tool, ToolFilters } from '@/types/management'
import { ToolForm } from './ToolForm'
import { DeleteConfirmDialog } from '../common/DeleteConfirmDialog'
import { LoadingSpinner, EmptyState } from '@/components/ui/loading'

export function ToolManagement() {
  const [tools, setTools] = useState<Tool[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingTool, setEditingTool] = useState<Tool | null>(null)
  const [deletingTool, setDeletingTool] = useState<Tool | null>(null)
  const [filters, setFilters] = useState<ToolFilters>({})
  const [searchTerm, setSearchTerm] = useState('')

  // Buscar tools
  const fetchTools = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      
      if (filters.method) {
        params.append('method', filters.method)
      }
      if (searchTerm) {
        params.append('search', searchTerm)
      }

      const response = await fetch(`/api/tools?${params.toString()}`)
      const data = await response.json()

      if (data.success) {
        setTools(data.data.data)
      } else {
        toast.error(data.error || 'Erro ao carregar tools')
      }
    } catch (error) {
      console.error('Error fetching tools:', error)
      toast.error('Erro ao carregar tools')
    } finally {
      setLoading(false)
    }
  }

  // Deletar tool
  const handleDeleteTool = async (tool: Tool) => {
    try {
      const response = await fetch(`/api/tools/${tool.id}`, {
        method: 'DELETE'
      })
      
      const data = await response.json()
      
      if (data.success) {
        toast.success('Tool deletada com sucesso')
        fetchTools()
      } else {
        toast.error(data.error || 'Erro ao deletar tool')
      }
    } catch (error) {
      console.error('Error deleting tool:', error)
      toast.error('Erro ao deletar tool')
    } finally {
      setDeletingTool(null)
    }
  }

  // Efeitos
  useEffect(() => {
    fetchTools()
  }, [filters, searchTerm])

  const handleFormSuccess = () => {
    setShowForm(false)
    setEditingTool(null)
    fetchTools()
  }

  const handleEditTool = (tool: Tool) => {
    setEditingTool(tool)
    setShowForm(true)
  }

  if (showForm) {
    return (
      <ToolForm
        tool={editingTool}
        onSuccess={handleFormSuccess}
        onCancel={() => {
          setShowForm(false)
          setEditingTool(null)
        }}
      />
    )
  }

  return (
    <div className="management-form">
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Gerenciamento de Tools</h1>
            <p className="text-muted-foreground">
              Crie e gerencie ferramentas HTTP para seus agentes
            </p>
          </div>
          <Button onClick={() => setShowForm(true)} className="gap-2 text-black">
            <Plus className="w-4 h-4" />
            Nova Tool
          </Button>
        </div>

      {/* Filtros e Busca */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Filtros</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="search">Buscar</Label>
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
          </div>
        </CardContent>
      </Card>

      {/* Lista de Tools */}
      {loading ? (
        <LoadingSpinner text="Carregando tools..." />
      ) : tools.length === 0 ? (
        <EmptyState
          title="Nenhuma tool encontrada"
          description="Crie sua primeira ferramenta HTTP para expandir as capacidades dos seus agentes"
          action={
            <Button onClick={() => setShowForm(true)} className="gap-2">
              <Plus className="w-4 h-4" />
              Criar primeira tool
            </Button>
          }
          icon={<Wrench className="w-full h-full" />}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {tools.map((tool) => (
            <Card key={tool.id} className="relative">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="space-y-2">
                    <CardTitle className="text-lg">{tool.name}</CardTitle>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-1 bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 rounded-full text-xs font-medium">
                        {tool.http_method || tool.http_config?.method || 'N/A'}
                      </span>
                      {tool.active !== undefined && (
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          tool.active 
                            ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200' 
                            : 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-200'
                        }`}>
                          {tool.active ? 'Ativa' : 'Inativa'}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEditTool(tool)}
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeletingTool(tool)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription className="mb-4">
                  {tool.description || 'Sem descrição'}
                </CardDescription>
                <div className="space-y-2 text-sm">
                  <div>
                    <span className="font-medium">ID:</span> {tool.id}
                  </div>
                  <div>
                    <span className="font-medium">Rota:</span> 
                    <span className="break-all">
                      {tool.route || (tool.http_config ? `${tool.http_config.base_url}${tool.http_config.endpoint}` : 'N/A')}
                    </span>
                  </div>
                  {tool.instructions && (
                    <div>
                      <span className="font-medium">Instruções:</span> 
                      <span className="text-muted-foreground">{tool.instructions}</span>
                    </div>
                  )}
                  <div>
                    <span className="font-medium">Parâmetros:</span> {tool.parameters?.length || tool.http_config?.parameters?.length || 0}
                  </div>
                  <div>
                    <span className="font-medium">Headers:</span> {Object.keys(tool.headers || tool.http_config?.headers || {}).length}
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
        title="Deletar Tool"
        description={`Tem certeza que deseja deletar a tool "${deletingTool?.name}"? Esta ação não pode ser desfeita.`}
        onConfirm={() => deletingTool && handleDeleteTool(deletingTool)}
      />
      </div>
    </div>
  )
}
