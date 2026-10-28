'use client'

import { useState, useEffect, useRef } from 'react'
import { useForm, type FieldErrors, type Path } from 'react-hook-form'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { ArrowLeft, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { withDefaults } from '@/lib/formDiff'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { TextArea } from '@/components/ui/textarea'
import { StatusBadge } from '@/components/ui/status-badge'
import {
  AgentConfig,
  AgentFormField,
  Tool,
  isAgentFormField
} from '@/types/management'
import { ConflictDialog } from '../common/ConflictDialog'
import { EntityActions } from '../common/EntityActions'
import type { EntityControls } from '../common/EntityLoader'
import { FieldError } from '../common/FieldError'
import { rejectedField } from '../common/rejectedField'
import { useRequestError } from '../common/useRequestError'
import { ConfigSchemaNotice } from '../common/ConfigSchemaNotice'
import { useConfigSchema } from '../common/useConfigSchema'
import { useSaveConflict, type OverwriteOutcome } from '../common/useSaveConflict'
import { diffAgent } from './agentDiff'
import { AgentFormValues, executionDefaults, toFormValues, toPayload } from './agentFormValues'
import { ExecutionSection } from '../common/ExecutionSection'
import { ModelSection } from '../common/ModelSection'
import { SectionCard } from '../common/SectionCard'
import { RagSection } from './RagSection'

// Ordem da tela dos campos do RAG: o 1º com erro leva o foco.
const RAG_ERROR_ORDER = [
  'rag_doc_name',
  'rag_search_strategy',
  'rag_factoryIaModel',
  'rag_model',
  'rag_base_url',
  'rag_api_key_ref',
  'rag_params'
] as const

// Campo do RAG a focar: o 1º com erro na ordem da tela; em `rag_params`, o valor
// da 1ª linha com erro.
function firstRagErrorPath(found: FieldErrors<AgentFormValues>): Path<AgentFormValues> | undefined {
  const first = RAG_ERROR_ORDER.find((name) => found[name])
  if (first !== 'rag_params') return first
  const row = found.rag_params?.findIndex?.((error) => !!error) ?? -1
  return `rag_params.${Math.max(row, 0)}.value`
}

interface AgentFormProps {
  agent?: AgentConfig | null
  /** Só na edição: recarregar, trocar a versão ou só atualizá-la (P3-06). */
  controls?: EntityControls<AgentConfig>
  onSuccess: () => void
}

export function AgentForm({ agent, controls, onSuccess }: AgentFormProps) {
  const [loading, setLoading] = useState(false)
  // Desativar, Reativar ou Excluir em andamento (P3-06): Salvar e Cancelar esperam.
  const [acting, setActing] = useState(false)
  const [availableTools, setAvailableTools] = useState<Tool[]>([])
  const [selectedToolIds, setSelectedToolIds] = useState<string[]>(agent?.tools_ids ?? [])
  const t = useTranslations('agents')
  const tf = useTranslations('agents.form')
  const tc = useTranslations('common')
  const requestError = useRequestError()
  const saveRef = useRef<HTMLButtonElement>(null)
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
    formState: { errors }
  } = form
  // RAG desligado com um campo com erro: os campos reaparecem (P3-05).
  const [ragReopened, setRagReopened] = useState(false)

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
    if (!storedEmbedder && !schema.embedderProviders.some(({ name }) => name === getValues('rag_factoryIaModel')))
      setValue('rag_factoryIaModel', schema.embedderProviders[0]?.name ?? '')
    // RAG novo (ou sem estratégia gravada): a 1ª do schema, que é o padrão do
    // orquestrador.
    if (!getValues('rag_search_strategy')) setValue('rag_search_strategy', schema.ragSearchStrategies[0] ?? '')
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

  // Mostra o RAG desligado e leva o foco ao campo; o elemento só existe
  // visível depois do render.
  const [ragFocus, setRagFocus] = useState<Path<AgentFormValues> | null>(null)
  const reveal = (name: Path<AgentFormValues>, reopen: boolean) => {
    if (reopen) setRagReopened(true)
    setRagFocus(name)
  }
  useEffect(() => {
    if (!ragFocus) return
    setFocus(ragFocus)
    setRagFocus(null)
  }, [ragFocus, setFocus])

  // Erro local (referência, com o RAG desligado): campo recolhido não pode
  // guardar o erro escondido. Foco só se for o único tipo de erro.
  const onInvalid = (found: FieldErrors<AgentFormValues>) => {
    if (getValues('rag_active')) return
    const first = firstRagErrorPath(found)
    if (!first) return
    setRagReopened(true)
    if (Object.keys(found).every((name) => name.startsWith('rag_'))) setRagFocus(first)
  }

  // Erro do orquestrador no campo recusado, sem o valor. `model_params` é um
  // grupo (o orquestrador não diz qual parâmetro): erro no grupo e foco no 1º
  // valor. `num_history_runs` com o histórico desligado tem o input desabilitado,
  // que não recebe foco: vai ao switch do histórico.
  // Campo do RAG com o switch desligado: os campos reaparecem e o foco vai a
  // ele depois do render (P3-05).
  const markRejected = (field: AgentFormField, data: AgentFormValues) => {
    const error = { type: 'server', message: tc('rejectedByOrchestrator') }
    const ragOff = !getValues('rag_active') && field !== 'rag_active' && field.startsWith('rag_')
    if (field === 'model_params') {
      setError('root.params', error)
      if (data.params.length > 0) setFocus('params.0.value')
    } else if (field === 'rag_model_params') {
      setError('root.rag_params', error)
      if (data.rag_params.length > 0) reveal('rag_params.0.value', ragOff)
    } else if (ragOff) {
      setError(field, error)
      reveal(field, true)
    } else if (field === 'num_history_runs' && !getValues('add_history_to_context')) {
      setError(field, error)
      setFocus('add_history_to_context')
    } else setError(field, error, { shouldFocus: true })
  }

  // Salva (PUT/POST). `base` é a versão atual lida no conflito (P3-06): o
  // "salvar por cima" grava o formulário com o If-Match e o `active` dela.
  // O estado nunca vem do formulário: salvar não liga nem desliga o agent.
  const submit = async (
    data: AgentFormValues,
    base?: { version: number; active: boolean },
    dismiss?: () => void
  ): Promise<OverwriteOutcome> => {
    try {
      setLoading(true)
      const target = base ?? agent
      const payload = toPayload({ ...data, active: target?.active ?? true }, selectedToolIds)

      const url = isEditing ? `/api/agents/${encodeURIComponent(agent.id)}` : '/api/agents'
      const method = isEditing ? 'PUT' : 'POST'

      // A versão lida vai no If-Match (P2-06): se mudou, o orquestrador recusa (412).
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(target ? { 'If-Match': `"${target.version}"` } : {})
        },
        body: JSON.stringify(payload)
      })

      const result = response.ok ? await response.json() : null

      if (result?.success) {
        toast.success(t('saved'))
        onSuccess()
        return 'saved'
      }
      // 412: o diálogo de conflito decide (sem toast).
      if (isEditing && response.status === 412) return 'conflict'
      // 422: o campo recusado pelo orquestrador ganha o erro (sem o valor).
      const field = await rejectedField(response, isAgentFormField)
      if (field) {
        // Salvar por cima: o diálogo fecha antes, para o foco ir ao campo com erro.
        dismiss?.()
        markRejected(field, data)
      }
      // 404 no "salvar por cima": o diálogo diz que foi excluído.
      if (!(base && response.status === 404))
        // 409 só é "id já existe" na criação.
        toast.error(
          requestError(response.status, {
            failed: t('saveError'),
            conflict: isEditing ? undefined : t('conflict'),
            notFound: t('notFound')
          })
        )
      return response.status === 404 ? 'missing' : 'failed'
    } catch (error) {
      console.error('Error saving agent:', error)
      toast.error(requestError(undefined, { failed: t('saveError') }))
      return 'failed'
    } finally {
      setLoading(false)
    }
  }

  // O que difere entre o formulário e uma versão da config (P3-06), pelos
  // mesmos valores que o salvar enviaria (o execution ausente vale o default do schema).
  const compare = (other: AgentConfig) =>
    diffAgent(
      toPayload(getValues(), selectedToolIds),
      toPayload(
        withDefaults(toFormValues(other), schema ? executionDefaults(schema) : {}),
        other.tools_ids
      ),
      tf
    )

  const conflict = useSaveConflict<AgentConfig>({
    url: `/api/agents/${encodeURIComponent(agent?.id ?? '')}`,
    compare,
    overwrite: (current, dismiss) => submit(getValues(), current, dismiss),
    controls
  })

  const onSubmit = async (data: AgentFormValues) => {
    if ((await submit(data)) === 'conflict' && agent) conflict.start(agent.version)
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
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h1 tabIndex={-1} className="text-2xl font-semibold tracking-tight focus:outline-none">
                {isEditing ? t('form.editTitle') : t('form.newTitle')}
              </h1>
              {agent && (
                <StatusBadge active={agent.active}>
                  {agent.active ? t('active') : t('inactive')}
                </StatusBadge>
              )}
            </div>
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
          return handleSubmit(onSubmit, onInvalid)(event)
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
            />
            <FieldError message={errors.descricao?.message} />
          </div>
        </SectionCard>

        <ModelSection
          entity="agent"
          form={form}
          schema={schema}
          status={schemaState.status}
          storedApiKeyRef={agent?.api_key_ref ?? ''}
          locked={selectsDisabled}
        />

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
              className="min-h-44 max-h-96"
            />
            <FieldError message={errors.prompt?.message} />
          </div>
        </SectionCard>

        <ExecutionSection
          entity="agent"
          form={form}
          schema={schema}
          status={schemaState.status}
          locked={selectsDisabled}
        />

        <RagSection
          form={form}
          schema={schema}
          status={schemaState.status}
          writable={writable}
          locked={selectsDisabled}
          storedApiKeyRef={agent?.rag_config?.api_key_ref ?? ''}
          reopened={ragReopened}
          onSettled={() => setRagReopened(false)}
        />

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
          {agent && controls && (
            <div className="border-t border-border pt-4 sm:border-0 sm:pt-0">
              <EntityActions
                kind="agents"
                id={agent.id}
                name={agent.nome}
                version={agent.version}
                active={agent.active}
                isDirty={() => compare(agent).length > 0}
                disabled={loading}
                reactivateBody={() =>
                  JSON.stringify(toPayload({ ...toFormValues(agent), active: true }, agent.tools_ids))
                }
                onDeleted={onSuccess}
                onChanged={controls.update}
                onReload={controls.reload}
                onBusyChange={setActing}
              />
            </div>
          )}
          <div className="flex flex-col-reverse gap-2 sm:ml-auto sm:flex-row sm:gap-4">
            <Button
              variant="outline"
              asChild
              className="h-10 aria-disabled:pointer-events-none aria-disabled:opacity-50 sm:h-9"
            >
              <Link href="/agents" aria-disabled={acting} tabIndex={acting ? -1 : undefined}>
                {tc('cancel')}
              </Link>
            </Button>
            <Button
              ref={saveRef}
              type="submit"
              disabled={loading || acting || schemaState.status !== 'ready'}
              className="h-10 gap-2 sm:h-9"
            >
              <Save className="w-4 h-4" />
              {loading ? tc('saving') : tc('save')}
            </Button>
          </div>
        </div>
        </fieldset>
      </form>
      {agent && controls && (
        <ConflictDialog
          {...conflict.dialog}
          kind="agents"
          name={agent.nome}
          listHref="/agents"
          saveRef={saveRef}
        />
      )}
      </div>
    </div>
  )
}
