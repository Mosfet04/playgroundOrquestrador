'use client'

import { useState, useEffect } from 'react'
import { Controller, useForm } from 'react-hook-form'
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
import {
  AgentConfig,
  AgentFormField,
  Tool,
  isAgentFormField
} from '@/types/management'
import { DeleteEntityButton } from '../common/DeleteEntityButton'
import { FieldError } from '../common/FieldError'
import { rejectedField } from '../common/rejectedField'
import { useRequestError } from '../common/useRequestError'
import { ConfigSchemaNotice } from '../common/ConfigSchemaNotice'
import { useConfigSchema, withCurrent } from '../common/useConfigSchema'
import { AgentFormValues, toFormValues, toPayload } from './agentFormValues'
import { ExecutionSection } from './ExecutionSection'
import { ModelSection } from './ModelSection'
import { SectionCard } from './SectionCard'

interface AgentFormProps {
  agent?: AgentConfig | null
  onSuccess: () => void
}

export function AgentForm({ agent, onSuccess }: AgentFormProps) {
  const [loading, setLoading] = useState(false)
  const [availableTools, setAvailableTools] = useState<Tool[]>([])
  const [selectedToolIds, setSelectedToolIds] = useState<string[]>([])
  const t = useTranslations('agents')
  const tc = useTranslations('common')
  const requestError = useRequestError()
  const { state: schemaState, retrying, reload: reloadSchema } = useConfigSchema()

  const isEditing = !!agent

  const form = useForm<AgentFormValues>({ defaultValues: toFormValues(agent) })
  const {
    register,
    handleSubmit,
    setValue,
    getValues,
    setError,
    setFocus,
    clearErrors,
    control,
    watch,
    formState: { errors }
  } = form

  const ragActive = watch('rag_active')
  const ragFactoryIaModel = watch('rag_factoryIaModel')

  // Opções do orquestrador (P3-01): sem schema os selects ficam desabilitados;
  // config só leitura desabilita o formulário todo.
  const schema = schemaState.status === 'ready' ? schemaState.schema : undefined
  const writable = schema?.writable ?? true
  // O `fieldset disabled` não segura o pointerdown num <button> (Chromium): o
  // Radix abre o Select nele, então o Select precisa estar desabilitado por si.
  const selectsDisabled = !schema || !writable

  // Provider padrão do playground que o orquestrador não oferece vira o 1º das
  // opções; o gravado fora delas só se preserva na edição (o embedder de um
  // agent sem RAG gravado também é padrão, não valor gravado).
  const storedEmbedder = agent?.rag_config?.factoryIaModel
  useEffect(() => {
    if (!schema) return
    if (!isEditing && !schema.chatProviders.some(({ name }) => name === getValues('factoryIaModel')))
      setValue('factoryIaModel', schema.chatProviders[0]?.name ?? '')
    if (!storedEmbedder && !schema.embedderProviders.includes(getValues('rag_factoryIaModel') ?? ''))
      setValue('rag_factoryIaModel', schema.embedderProviders[0] ?? '')
  }, [schema, isEditing, storedEmbedder, getValues, setValue])

  // Campo de execução ausente (agent novo ou sem o campo) vale o default do
  // schema (P3-02). O número vazio vem como NaN: o input o lê assim ao montar.
  useEffect(() => {
    if (!schema) return
    const { agent: defaults } = schema
    const flags = [
      ['markdown', defaults.markdown],
      ['add_datetime_to_context', defaults.addDatetimeToContext],
      ['add_history_to_context', defaults.addHistoryToContext],
      ['reasoning', defaults.reasoning]
    ] as const
    for (const [field, value] of flags) if (getValues(field) === undefined) setValue(field, value)
    const runs = getValues('num_history_runs')
    if (runs === undefined || Number.isNaN(runs))
      setValue('num_history_runs', defaults.numHistoryRuns.default)
  }, [schema, getValues, setValue])

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

  // Erro do orquestrador no campo recusado, sem o valor. `model_params` é um
  // grupo (o orquestrador não diz qual parâmetro): erro no grupo e foco no 1º
  // valor. `num_history_runs` com o histórico desligado tem o input desabilitado,
  // que não recebe foco: vai ao switch do histórico.
  const markRejected = (field: AgentFormField, params: AgentFormValues['params']) => {
    const error = { type: 'server', message: tc('rejectedByOrchestrator') }
    if (field === 'model_params') {
      setError('root.params', error)
      if (params.length > 0) setFocus('params.0.value')
    } else if (field === 'num_history_runs' && !getValues('add_history_to_context')) {
      setError(field, error)
      setFocus('add_history_to_context')
    } else setError(field, error, { shouldFocus: true })
  }

  // Submit do formulário
  const onSubmit = async (data: AgentFormValues) => {
    try {
      setLoading(true)

      const payload = toPayload(data, selectedToolIds)

      const url = isEditing ? `/api/agents/${encodeURIComponent(agent.id)}` : '/api/agents'
      const method = isEditing ? 'PUT' : 'POST'

      // A versão lida vai no If-Match (P2-06): se mudou, o orquestrador recusa (412).
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(isEditing ? { 'If-Match': `"${agent.version}"` } : {})
        },
        body: JSON.stringify(payload)
      })

      const result = response.ok ? await response.json() : null

      if (result?.success) {
        toast.success(t('saved'))
        onSuccess()
      } else {
        // 422: o campo recusado pelo orquestrador ganha o erro (sem o valor).
        const field = await rejectedField(response, isAgentFormField)
        if (field) markRejected(field, data.params)
        // 409 só é "id já existe" na criação.
        toast.error(
          requestError(response.status, {
            failed: t('saveError'),
            conflict: isEditing ? undefined : t('conflict'),
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

      <ConfigSchemaNotice
        status={schemaState.status}
        writable={writable}
        retrying={retrying}
        onRetry={reloadSchema}
      />

      {/* O erro do servidor num campo sem regra (Select, Switch, tools) não
          sai na validação: limpo antes, ele não trava o próximo envio. */}
      {/* noValidate: faixa e passo do número são validados pelo formulário, com
          a mensagem do catálogo (não a bolha do navegador). */}
      <form
        noValidate
        onSubmit={(event) => {
          clearErrors()
          return handleSubmit(onSubmit)(event)
        }}
      >
        <fieldset disabled={!writable} className="min-w-0 space-y-6">
        <SectionCard id="agent-identity" title={t('form.basicInfo')} description={t('form.basicInfoDescription')}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="id">{t('form.id')}</Label>
              <Input
                id="id"
                {...register('id', { required: tc('idRequired') })}
                disabled={isEditing}
                placeholder={tc('example', { value: 'agent-1' })}
              />
              <FieldError message={errors.id?.message} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="nome">{t('form.name')}</Label>
              <Input
                id="nome"
                {...register('nome', { required: tc('nameRequired') })}
                placeholder={t('form.namePlaceholder')}
              />
              <FieldError message={errors.nome?.message} />
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
            <FieldError message={errors.descricao?.message} />
          </div>

          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <Controller
                control={control}
                name="active"
                render={({ field }) => (
                  <Switch
                    id="active"
                    ref={field.ref}
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                )}
              />
              <Label htmlFor="active">{t('form.active')}</Label>
            </div>
            <FieldError message={errors.active?.message} />
          </div>
        </SectionCard>

        <ModelSection form={form} schema={schema} locked={selectsDisabled} />

        <SectionCard
          id="agent-instructions"
          title={t('form.instructions')}
          description={t('form.instructionsDescription')}
        >
          <div className="space-y-2">
            <Label htmlFor="prompt">{t('form.systemPrompt')}</Label>
            <TextArea
              id="prompt"
              {...register('prompt')}
              placeholder={t('form.systemPromptPlaceholder')}
              rows={8}
            />
            <FieldError message={errors.prompt?.message} />
          </div>
        </SectionCard>

        <ExecutionSection
          form={form}
          schema={schema}
          status={schemaState.status}
          locked={selectsDisabled}
        />

        <SectionCard id="agent-rag" title={t('form.rag')} description={t('form.ragDescription')}>
          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <Controller
                control={control}
                name="rag_active"
                render={({ field }) => (
                  <Switch
                    id="rag_active"
                    ref={field.ref}
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                )}
              />
              <Label htmlFor="rag_active">{t('form.ragEnable')}</Label>
            </div>
            <FieldError message={errors.rag_active?.message} />
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
                <FieldError message={errors.rag_doc_name?.message} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="rag_factoryIaModel">{t('form.ragProvider')}</Label>
                <Select
                  value={ragFactoryIaModel}
                  disabled={selectsDisabled}
                  onValueChange={(value) => setValue('rag_factoryIaModel', value)}
                >
                  <SelectTrigger id="rag_factoryIaModel">
                    <SelectValue placeholder={t('form.providerPlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    {withCurrent(schema?.embedderProviders ?? [], ragFactoryIaModel).map((provider) => (
                      <SelectItem key={provider} value={provider}>
                        {provider}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldError message={errors.rag_factoryIaModel?.message} />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="rag_model">{t('form.ragModel')}</Label>
                <Input
                  id="rag_model"
                  {...register('rag_model')}
                  placeholder={tc('example', { value: 'text-embedding-3-small' })}
                />
                <FieldError message={errors.rag_model?.message} />
              </div>
            </div>
          )}
        </SectionCard>

        <SectionCard id="agent-tools" title={t('form.tools')} description={t('form.toolsDescription')}>
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
          <FieldError message={errors.tools_ids?.message} />
        </SectionCard>

        {/* Botões de ação */}
        {/* Abaixo de sm: Salvar, Cancelar e, depois de uma divisória, Excluir. */}
        <div className="flex flex-col-reverse gap-4 sm:flex-row sm:items-center sm:justify-between">
          {agent && (
            <div className="border-t border-border pt-4 sm:border-0 sm:pt-0">
              <DeleteEntityButton
                url={`/api/agents/${encodeURIComponent(agent.id)}`}
                version={agent.version}
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
            <Button
              type="submit"
              disabled={loading || schemaState.status !== 'ready'}
              className="h-10 gap-2 sm:h-9"
            >
              <Save className="w-4 h-4" />
              {loading ? tc('saving') : tc('save')}
            </Button>
          </div>
        </div>
        </fieldset>
      </form>
      </div>
    </div>
  )
}
