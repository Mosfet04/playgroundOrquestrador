'use client'

import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
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
import { DeleteEntityButton } from '../common/DeleteEntityButton'
import { useRequestError } from '../common/useRequestError'

interface AgentFormProps {
  agent?: AgentConfig | null
  onSuccess: () => void
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

export function AgentForm({ agent, onSuccess }: AgentFormProps) {
  const [loading, setLoading] = useState(false)
  const [availableTools, setAvailableTools] = useState<Tool[]>([])
  const [selectedToolIds, setSelectedToolIds] = useState<string[]>([])
  const t = useTranslations('agents')
  const tc = useTranslations('common')
  const requestError = useRequestError()

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

  // Buscar todas as tools disponíveis (a API é paginada)
  useEffect(() => {
    const fetchTools = async () => {
      try {
        const tools: Tool[] = []
        for (let page = 1, totalPages = 1; page <= totalPages; page++) {
          const response = await fetch(`/api/tools?limit=100&page=${page}`)
          const data = await response.json()
          if (!data.success) return
          tools.push(...data.data.data)
          totalPages = data.data.totalPages
        }
        setAvailableTools(tools)
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

      const url = isEditing ? `/api/agents/${encodeURIComponent(agent.id)}` : '/api/agents'
      const method = isEditing ? 'PUT' : 'POST'

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      })

      const result = response.ok ? await response.json() : null

      if (result?.success) {
        toast.success(t('saved'))
        onSuccess()
      } else {
        toast.error(
          requestError(response.status, {
            failed: t('saveError'),
            conflict: t('conflict'),
            notFound: t('notFound')
          })
        )
      }
    } catch (error) {
      console.error('Error saving agent:', error)
      toast.error(requestError(undefined, { failed: t('saveError') }))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" asChild className="gap-2">
            <Link href="/agents">
              <ArrowLeft className="w-4 h-4" aria-hidden="true" />
              {tc('back')}
            </Link>
          </Button>
          <div>
            <h1 tabIndex={-1} className="text-2xl font-semibold tracking-tight focus:outline-none">
              {isEditing ? t('form.editTitle') : t('form.newTitle')}
            </h1>
            <p className="text-muted-foreground">
              {isEditing ? t('form.editSubtitle') : t('form.newSubtitle')}
            </p>
          </div>
        </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Informações Básicas */}
        <Card>
          <CardHeader>
            <CardTitle>{t('form.basicInfo')}</CardTitle>
            <CardDescription>
              {t('form.basicInfoDescription')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="id">{t('form.id')}</Label>
                <Input
                  id="id"
                  {...register('id', { required: tc('idRequired') })}
                  disabled={isEditing}
                  placeholder={tc('example', { value: 'agent-1' })}
                />
                {errors.id && (
                  <p className="text-sm text-destructive">{errors.id.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="nome">{t('form.name')}</Label>
                <Input
                  id="nome"
                  {...register('nome', { required: tc('nameRequired') })}
                  placeholder={t('form.namePlaceholder')}
                />
                {errors.nome && (
                  <p className="text-sm text-destructive">{errors.nome.message}</p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="descricao">{t('form.description')}</Label>
              <TextArea
                id="descricao"
                {...register('descricao')}
                placeholder={t('form.descriptionPlaceholder')}
                rows={3}
              />
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="active"
                checked={watch('active')}
                onCheckedChange={(checked) => setValue('active', checked)}
              />
              <Label htmlFor="active">{t('form.active')}</Label>
            </div>
          </CardContent>
        </Card>

        {/* Configuração do Modelo */}
        <Card>
          <CardHeader>
            <CardTitle>{t('form.modelSettings')}</CardTitle>
            <CardDescription>
              {t('form.modelSettingsDescription')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="factoryIaModel">{t('form.provider')}</Label>
                <Select
                value={factoryIaModel}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                onValueChange={(value) => setValue('factoryIaModel', value as any)}
                >
                <SelectTrigger id="factoryIaModel">
                    <SelectValue placeholder={t('form.providerPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                    {modelProviders.map((provider) => (
                    <SelectItem key={provider.value} value={provider.value}>
                        {provider.label}
                    </SelectItem>
                    ))}
                </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="model">{t('form.model')}</Label>
                <Input
                  id="model"
                  {...register('model', { required: t('form.modelRequired') })}
                  placeholder={tc('example', {
                    value:
                      factoryIaModel === 'ollama' ? 'llama3.2:latest' :
                      factoryIaModel === 'openai' ? 'gpt-4' :
                      'claude-3-sonnet'
                  })}
                />
                {errors.model && (
                  <p className="text-sm text-destructive">{errors.model.message}</p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="prompt">{t('form.systemPrompt')}</Label>
              <TextArea
                id="prompt"
                {...register('prompt')}
                placeholder={t('form.systemPromptPlaceholder')}
                rows={5}
              />
            </div>
          </CardContent>
        </Card>

        {/* Configuração RAG */}
        <Card>
          <CardHeader>
            <CardTitle>{t('form.rag')}</CardTitle>
            <CardDescription>
              {t('form.ragDescription')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center space-x-2">
              <Switch
                id="rag_active"
                checked={ragActive}
                onCheckedChange={(checked) => setValue('rag_active', checked)}
              />
              <Label htmlFor="rag_active">{t('form.ragEnable')}</Label>
            </div>

            {ragActive && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="rag_doc_name">{t('form.ragDocName')}</Label>
                  <Input
                    id="rag_doc_name"
                    {...register('rag_doc_name')}
                    placeholder={tc('example', { value: 'knowledge_base' })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="rag_factoryIaModel">{t('form.ragProvider')}</Label>
                  <Select
                    value={watch('rag_factoryIaModel')}
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    onValueChange={(value) => setValue('rag_factoryIaModel', value as any)}
                  >
                    <SelectTrigger id="rag_factoryIaModel">
                      <SelectValue placeholder={t('form.providerPlaceholder')} />
                    </SelectTrigger>
                    <SelectContent>
                      {ragProviders.map((provider) => (
                        <SelectItem key={provider.value} value={provider.value}>
                          {provider.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="rag_model">{t('form.ragModel')}</Label>
                  <Input
                    id="rag_model"
                    {...register('rag_model')}
                    placeholder={tc('example', { value: 'text-embedding-3-small' })}
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Tools */}
        <Card>
          <CardHeader>
            <CardTitle>{t('form.tools')}</CardTitle>
            <CardDescription>
              {t('form.toolsDescription')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {availableTools.length === 0 ? (
              <p className="text-muted-foreground">
                {t('form.noTools')}
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
                      className="w-4 h-4 accent-primary"
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
        {/* Abaixo de sm: Salvar, Cancelar e, depois de uma divisória, Excluir. */}
        <div className="flex flex-col-reverse gap-4 sm:flex-row sm:items-center sm:justify-between">
          {agent && (
            <div className="border-t border-border pt-4 sm:border-0 sm:pt-0">
              <DeleteEntityButton
                url={`/api/agents/${encodeURIComponent(agent.id)}`}
                texts={{
                  label: t('deleteLabel'),
                  title: t('deleteTitle'),
                  description: t('deleteDescription', { name: agent.nome }),
                  deleted: t('deleted'),
                  failed: t('deleteError'),
                  notFound: t('notFound')
                }}
                disabled={loading}
                onDeleted={onSuccess}
              />
            </div>
          )}
          <div className="flex flex-col-reverse gap-2 sm:ml-auto sm:flex-row sm:gap-4">
            <Button variant="outline" asChild className="h-10 sm:h-9">
              <Link href="/agents">{tc('cancel')}</Link>
            </Button>
            <Button type="submit" disabled={loading} className="h-10 gap-2 sm:h-9">
              <Save className="w-4 h-4" />
              {loading ? tc('saving') : tc('save')}
            </Button>
          </div>
        </div>
      </form>
      </div>
    </div>
  )
}
