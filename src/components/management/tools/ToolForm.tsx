'use client'

import { useEffect, useRef, useState } from 'react'
import { useFieldArray, useForm } from 'react-hook-form'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { ArrowLeft, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/ui/status-badge'
import { referencePrefixes } from '@/lib/secretRef'
import { routeOrigin } from '@/lib/toolRoute'
import { Tool, ToolFormField, isToolFormField } from '@/types/management'
import { ConflictDialog } from '../common/ConflictDialog'
import { EntityActions } from '../common/EntityActions'
import type { EntityControls } from '../common/EntityLoader'
import { rejectedField } from '../common/rejectedField'
import { useRequestError } from '../common/useRequestError'
import { useSaveConflict, type OverwriteOutcome } from '../common/useSaveConflict'
import { ConfigSchemaNotice } from '../common/ConfigSchemaNotice'
import { useConfigSchema } from '../common/useConfigSchema'
import { BasicInfoSection } from './BasicInfoSection'
import { HttpSection } from './HttpSection'
import { type FocusRequest, ParametersSection } from './ParametersSection'
import { RequestPreview } from './RequestPreview'
import { diffTool } from './toolDiff'
import { ToolFormValues, toFormValues, toPayload, toolProblems } from './toolFormValues'

interface ToolFormProps {
  tool?: Tool | null
  /** Só na edição: recarregar, trocar a versão ou só atualizá-la (P3-06). */
  controls?: EntityControls<Tool>
  onSuccess: () => void
}

// Sem schema (carregando ou falha) os prefixos de referência são desconhecidos:
// o que é referência segue sendo `env:`/`file:` só para classificar e mostrar.
const FALLBACK_PREFIXES = ['env:', 'file:']

const isParameterField = (field: ToolFormField): field is `parameters.${number}` =>
  field.startsWith('parameters.')

export function ToolForm({ tool, controls, onSuccess }: ToolFormProps) {
  const [loading, setLoading] = useState(false)
  // Desativar, Reativar ou Excluir em andamento (P3-06): Salvar e Cancelar esperam.
  const [acting, setActing] = useState(false)
  const saveRef = useRef<HTMLButtonElement>(null)
  const [created, setCreated] = useState<string[]>([])
  const addHeaderRef = useRef<HTMLButtonElement | null>(null)
  const addParameterRef = useRef<HTMLButtonElement | null>(null)
  const [focusRequest, setFocusRequest] = useState<FocusRequest | null>(null)

  const isEditing = !!tool
  const t = useTranslations('tools')
  const tf = useTranslations('tools.form')
  const tc = useTranslations('common')
  const requestError = useRequestError()
  const { state: schemaState, retrying, reload: reloadSchema } = useConfigSchema()
  // Opções do orquestrador (P3-01): sem schema os selects ficam desabilitados;
  // config só leitura desabilita o formulário todo.
  const schema = schemaState.status === 'ready' ? schemaState.schema : undefined
  const writable = schema?.writable ?? true
  // O `fieldset disabled` não segura o pointerdown num <button> (Chromium): o
  // Radix abriria o menu; o Select precisa estar desabilitado por si.
  const selectsDisabled = !schema || !writable
  const prefixes = schema ? referencePrefixes(schema.apiKeyRefFormats) : FALLBACK_PREFIXES
  // O `***` só se mantém na origem em que foi gravado.
  const loadedOrigin = tool ? routeOrigin(tool.route) : null

  const form = useForm<ToolFormValues>({ defaultValues: toFormValues(tool) })
  const { handleSubmit, setValue, getValues, setError, setFocus, clearErrors, control, watch } = form
  const parameters = useFieldArray({ control, name: 'parameters' })
  const problems = toolProblems(watch(), prefixes)

  // Tool nova: método padrão que o orquestrador não oferece vira o 1º das
  // opções (o gravado fora delas só se preserva na edição).
  useEffect(() => {
    if (!schema || isEditing) return
    if (!schema.httpMethods.includes(getValues('http_method')))
      setValue('http_method', schema.httpMethods[0] ?? '')
  }, [schema, isEditing, getValues, setValue])

  // Foco no campo que só existe depois do render (parâmetro criado, removido).
  useEffect(() => {
    if (!focusRequest) return
    if (focusRequest === 'add-parameter') addParameterRef.current?.focus()
    else setFocus(focusRequest)
    setFocusRequest(null)
  }, [focusRequest, setFocus])

  // Um clique cria o parâmetro da rota: obrigatório, tipo string (D-P3-03-2).
  const createParams = (names: string[]) => {
    const first = parameters.fields.length
    parameters.append(
      names.map((name) => ({ name, type: 'string', description: '', required: true, default_text: '' }))
    )
    setCreated(names)
    setFocusRequest(`parameters.${first}.description`)
  }

  // Erro do orquestrador no campo recusado, sem o valor. `headers` é um grupo
  // (o orquestrador não diz qual): erro no grupo e foco no 1º valor;
  // `parameters.<posição>` vai à linha, com foco no nome.
  const markRejected = (field: ToolFormField, data: ToolFormValues) => {
    const error = { type: 'server', message: tc('rejectedByOrchestrator') }
    if (field === 'headers') {
      setError('root.headers', { type: 'server', message: t('form.headersRejected') })
      if (data.headers.length > 0) setFocus('headers.0.value')
      else addHeaderRef.current?.focus()
    } else if (isParameterField(field)) {
      setError(field, error)
      setFocus(`parameters.${Number(field.slice('parameters.'.length))}.name`)
    } else setError(field, error, { shouldFocus: true })
  }

  // Nada é enviado enquanto houver problema local; o foco vai ao primeiro, na
  // ordem da tela (rota, headers, parâmetros).
  const focusFirstProblem = (found: ReturnType<typeof toolProblems>) => {
    if (found.missing.length > 0 || found.spaced.length > 0) {
      setFocus('route')
      return true
    }
    const header = found.headers.findIndex((problem) => problem.name || problem.value)
    if (header >= 0) {
      const field = found.headers[header].name ? 'name' : 'value'
      setFocus(`headers.${header}.${field}`)
      return true
    }
    const parameter = found.defaults.findIndex(Boolean)
    if (parameter >= 0) {
      setFocus(`parameters.${parameter}.default_text`)
      return true
    }
    return false
  }

  // Salva (PUT/POST). `base` é a versão atual lida no conflito (P3-06): o
  // "salvar por cima" grava o formulário com o If-Match e o `active` dela.
  // O estado nunca vem do formulário: salvar não liga nem desliga a tool.
  const submit = async (
    data: ToolFormValues,
    base?: { version: number; active: boolean },
    dismiss?: () => void
  ): Promise<OverwriteOutcome> => {
    try {
      setLoading(true)
      const target = base ?? tool

      const url = isEditing ? `/api/tools/${encodeURIComponent(tool.id)}` : '/api/tools'
      const method = isEditing ? 'PUT' : 'POST'

      // A versão lida vai no If-Match (P2-06): se mudou, o orquestrador recusa (412).
      // Header oculto (`***`) volta como veio: o orquestrador mantém o gravado.
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(target ? { 'If-Match': `"${target.version}"` } : {})
        },
        body: JSON.stringify(toPayload({ ...data, active: target?.active ?? true }))
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
      const field = await rejectedField(response, isToolFormField)
      if (field) {
        // Salvar por cima: o diálogo fecha antes, para o foco ir ao campo com erro.
        dismiss?.()
        markRejected(field, data)
      }
      // 404 no "salvar por cima": o diálogo diz que foi excluída.
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
      console.error('Error saving tool:', error)
      toast.error(requestError(undefined, { failed: t('saveError') }))
      return 'failed'
    } finally {
      setLoading(false)
    }
  }

  // O que difere entre o formulário e uma versão da config (P3-06), pelos
  // mesmos valores que o salvar enviaria.
  const compare = (other: Tool) =>
    diffTool(toPayload(getValues()), toPayload(toFormValues(other)), tf, prefixes)

  const conflict = useSaveConflict<Tool>({
    url: `/api/tools/${encodeURIComponent(tool?.id ?? '')}`,
    compare,
    overwrite: (current, dismiss) => submit(getValues(), current, dismiss),
    controls
  })

  // Submit do formulário
  const onSubmit = async (data: ToolFormValues) => {
    const found = toolProblems(data, prefixes)
    if (focusFirstProblem(found)) return
    if ((await submit(data)) === 'conflict' && tool) conflict.start(tool.version)
  }

  return (
    <div>
      <div className="mx-auto max-w-4xl space-y-6 p-6 xl:max-w-6xl">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" asChild className="gap-2">
            <Link href="/tools">
              <ArrowLeft className="w-4 h-4" aria-hidden="true" />
              {tc('back')}
            </Link>
          </Button>
          <div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h1 tabIndex={-1} className="text-2xl font-semibold tracking-tight focus:outline-none">
                {isEditing ? t('form.editTitle') : t('form.newTitle')}
              </h1>
              {tool && (
                <StatusBadge active={tool.active}>
                  {tool.active ? t('active') : t('inactive')}
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

        {/* O erro do servidor num campo sem regra (Select, headers) não
            sai na validação: limpo antes, ele não trava o próximo envio. */}
        <form
          onSubmit={(event) => {
            clearErrors()
            return handleSubmit(onSubmit)(event)
          }}
        >
          {/* Do xl em diante: formulário à esquerda e Requisição fixa à direita. */}
          <fieldset
            disabled={!writable}
            className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,1fr)_21rem] xl:items-start"
          >
            <BasicInfoSection form={form} isEditing={isEditing} />
            <HttpSection
              form={form}
              schema={schema}
              loadingSchema={schemaState.status === 'loading'}
              locked={selectsDisabled}
              missing={problems.missing}
              spaced={problems.spaced}
              created={created}
              onCreateParams={createParams}
              prefixes={prefixes}
              headerProblems={problems.headers}
              loadedOrigin={loadedOrigin}
              addHeaderRef={addHeaderRef}
            />
            <ParametersSection
              form={form}
              list={parameters}
              schema={schema}
              locked={selectsDisabled}
              defaultErrors={problems.defaults}
              requestFocus={setFocusRequest}
              addRef={addParameterRef}
            />
            <RequestPreview form={form} prefixes={prefixes} />

            {/* Botões de ação */}
            {/* Abaixo de sm: Salvar, Cancelar e, depois de uma divisória, Excluir. */}
            <div className="flex flex-col-reverse gap-4 sm:flex-row sm:items-center sm:justify-between xl:col-start-1">
              {tool && controls && (
                <div className="border-t border-border pt-4 sm:border-0 sm:pt-0">
                  <EntityActions
                    kind="tools"
                    id={tool.id}
                    name={tool.name}
                    version={tool.version}
                    active={tool.active}
                    isDirty={() => compare(tool).length > 0}
                    disabled={loading}
                    reactivateBody={() =>
                      JSON.stringify(toPayload({ ...toFormValues(tool), active: true }))
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
                  <Link href="/tools" aria-disabled={acting} tabIndex={acting ? -1 : undefined}>
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
        {tool && controls && (
          <ConflictDialog
            {...conflict.dialog}
            kind="tools"
            name={tool.name}
            listHref="/tools"
            saveRef={saveRef}
          />
        )}
      </div>
    </div>
  )
}
