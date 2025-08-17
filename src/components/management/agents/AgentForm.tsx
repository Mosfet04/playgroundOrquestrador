'use client'

import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { ArrowLeft, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { TextArea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AgentConfig, CreateAgentForm, Tool } from '@/types/management'

interface AgentFormProps {
  agent?: AgentConfig | null
  onSuccess: () => void
  onCancel: () => void
}

const modelProviders = [
  { value: 'ollama', label: 'Ollama' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'gemini', label: 'Google Gemini' },
  { value: 'groq', label: 'Groq' },
  { value: 'azure', label: 'Azure OpenAI' }
]

const ragProviders = [
  { value: 'ollama', label: 'Ollama' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'gemini', label: 'Google Gemini' },
  { value: 'azure', label: 'Azure OpenAI' }
]

export function AgentForm({ agent, onSuccess, onCancel }: AgentFormProps) {
  const [loading, setLoading] = useState(false)
  const [availableTools, setAvailableTools] = useState<Tool[]>([])
  const [selectedToolIds, setSelectedToolIds] = useState<string[]>([])

  const isEditing = !!agent

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors }
  } = useForm<CreateAgentForm>({
    defaultValues: {
      id: agent?.id || '',
      nome: agent?.nome || '',
      model: agent?.model || '',
      factoryIaModel: agent?.factoryIaModel || 'ollama',
      descricao: agent?.descricao || '',
      prompt: agent?.prompt || '',
      active: agent?.active !== undefined ? agent.active : true,
      tools_ids: agent?.tools_ids || [],
      rag_active: agent?.rag_config?.active || false,
      rag_doc_name: agent?.rag_config?.doc_name || '',
      rag_model: agent?.rag_config?.model || '',
      rag_factoryIaModel: agent?.rag_config?.factoryIaModel || 'openai'
    }
  })

  const ragActive = watch('rag_active')
  const factoryIaModel = watch('factoryIaModel')

  // Buscar tools disponíveis
  useEffect(() => {
    const fetchTools = async () => {
      try {
        const response = await fetch('/api/tools')
        const data = await response.json()
        if (data.success) {
          setAvailableTools(data.data.data)
        }
      } catch (error) {
        console.error('Error fetching tools:', error)
      }
    }
    fetchTools()
  }, [])

  // Definir tools selecionadas
  useEffect(() => {
    if (agent?.tools_ids) {
      setSelectedToolIds(agent.tools_ids)
    }
  }, [agent])

  // Submit do formulário
  const onSubmit = async (data: CreateAgentForm) => {
    try {
      setLoading(true)

      const payload = {
        ...data,
        tools_ids: selectedToolIds
      }

      const url = isEditing ? `/api/agents/${agent.id}` : '/api/agents'
      const method = isEditing ? 'PUT' : 'POST'

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      })

      const result = await response.json()

      if (result.success) {
        toast.success(result.message || 'Agente salvo com sucesso')
        onSuccess()
      } else {
        toast.error(result.error || 'Erro ao salvar agente')
      }
    } catch (error) {
      console.error('Error saving agent:', error)
      toast.error('Erro interno do servidor')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="management-form">
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={onCancel} className="gap-2">
            <ArrowLeft className="w-4 h-4" />
            Voltar
          </Button>
          <div>
            <h1 className="text-3xl font-bold">
              {isEditing ? 'Editar Agente' : 'Novo Agente'}
            </h1>
            <p className="text-muted-foreground">
              {isEditing 
                ? 'Edite as configurações do agente' 
                : 'Configure um novo agente de IA'
              }
            </p>
          </div>
        </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Informações Básicas */}
        <Card>
          <CardHeader>
            <CardTitle>Informações Básicas</CardTitle>
            <CardDescription>
              Configure as informações principais do agente
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="id">ID do Agente *</Label>
                <Input
                  id="id"
                  {...register('id', { required: 'ID é obrigatório' })}
                  disabled={isEditing}
                  placeholder="ex: agent-1"
                />
                {errors.id && (
                  <p className="text-sm text-destructive">{errors.id.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="nome">Nome *</Label>
                <Input
                  id="nome"
                  {...register('nome', { required: 'Nome é obrigatório' })}
                  placeholder="ex: Assistente Geral"
                />
                {errors.nome && (
                  <p className="text-sm text-destructive">{errors.nome.message}</p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="descricao">Descrição</Label>
              <TextArea
                id="descricao"
                {...register('descricao')}
                placeholder="Breve descrição do agente..."
                rows={3}
              />
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                checked={watch('active')}
                onCheckedChange={(checked) => setValue('active', checked)}
              />
              <Label>Agente ativo</Label>
            </div>
          </CardContent>
        </Card>

        {/* Configuração do Modelo */}
        <Card>
          <CardHeader>
            <CardTitle>Configuração do Modelo</CardTitle>
            <CardDescription>
              Configure o modelo de IA que será utilizado
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Provider *</Label>
                <Select
                value={factoryIaModel}
                onValueChange={(value) => setValue('factoryIaModel', value as any)}
                >
                <SelectTrigger className="bg-black border border-white text-white">
                    <SelectValue placeholder="Selecione o provider" />
                </SelectTrigger>
                <SelectContent className="bg-black border border-white text-white">
                    {modelProviders.map((provider) => (
                    <SelectItem
                        key={provider.value}
                        value={provider.value}
                        className="text-white hover:bg-white hover:text-black"
                    >
                        {provider.label}
                    </SelectItem>
                    ))}
                </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="model">Modelo *</Label>
                <Input
                  id="model"
                  {...register('model', { required: 'Modelo é obrigatório' })}
                  placeholder={
                    factoryIaModel === 'ollama' ? 'ex: llama3.2:latest' :
                    factoryIaModel === 'openai' ? 'ex: gpt-4' :
                    'ex: claude-3-sonnet'
                  }
                />
                {errors.model && (
                  <p className="text-sm text-destructive">{errors.model.message}</p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="prompt">Prompt do Sistema</Label>
              <TextArea
                id="prompt"
                {...register('prompt')}
                placeholder="Você é um assistente útil que..."
                rows={5}
              />
            </div>
          </CardContent>
        </Card>

        {/* Configuração RAG */}
        <Card>
          <CardHeader>
            <CardTitle>Configuração RAG</CardTitle>
            <CardDescription>
              Configure o sistema de Retrieval-Augmented Generation
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center space-x-2">
              <Switch
                checked={ragActive}
                onCheckedChange={(checked) => setValue('rag_active', checked)}
              />
              <Label>Habilitar RAG</Label>
            </div>

            {ragActive && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="rag_doc_name">Nome do Documento</Label>
                  <Input
                    id="rag_doc_name"
                    {...register('rag_doc_name')}
                    placeholder="ex: knowledge_base"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Provider de Embedding</Label>
                  <Select
                    value={watch('rag_factoryIaModel')}
                    onValueChange={(value) => setValue('rag_factoryIaModel', value as any)}
                  >
                    <SelectTrigger className="bg-black border border-white text-white">
                      <SelectValue placeholder="Selecione o provider" />
                    </SelectTrigger>
                    <SelectContent className="bg-black border border-white text-white">
                      {ragProviders.map((provider) => (
                        <SelectItem key={provider.value} value={provider.value}>
                          {provider.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="rag_model">Modelo de Embedding</Label>
                  <Input
                    id="rag_model"
                    {...register('rag_model')}
                    placeholder="ex: text-embedding-3-small"
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Tools */}
        <Card>
          <CardHeader>
            <CardTitle>Tools Disponíveis</CardTitle>
            <CardDescription>
              Selecione as ferramentas que o agente pode utilizar
            </CardDescription>
          </CardHeader>
          <CardContent>
            {availableTools.length === 0 ? (
              <p className="text-muted-foreground">
                Nenhuma tool disponível. Crie tools primeiro.
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {availableTools.map((tool) => (
                  <div
                    key={tool.id}
                    className="flex items-center space-x-2 p-3 border rounded-lg"
                  >
                    <input
                      type="checkbox"
                      id={`tool-${tool.id}`}
                      checked={selectedToolIds.includes(tool.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedToolIds([...selectedToolIds, tool.id])
                        } else {
                          setSelectedToolIds(selectedToolIds.filter(id => id !== tool.id))
                        }
                      }}
                      className="w-4 h-4"
                    />
                    <Label htmlFor={`tool-${tool.id}`} className="flex-1">
                      <div className="font-medium">{tool.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {tool.description}
                      </div>
                    </Label>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Botões de ação */}
        <div className="flex justify-end gap-4">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
          <Button type="submit" disabled={loading} className="gap-2 text-black">
            <Save className="w-4 h-4" />
            {loading ? 'Salvando...' : 'Salvar Agente'}
          </Button>
        </div>
      </form>
      </div>
    </div>
  )
}
