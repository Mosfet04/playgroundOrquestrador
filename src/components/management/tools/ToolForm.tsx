'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useFieldArray, useForm } from 'react-hook-form'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { ArrowLeft, Save } from 'lucide-react'
import { useApplyRevision } from '@/components/layout/RuntimeRevision'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/ui/status-badge'
import { boolRow } from '@/lib/formDiff'
import { referencePrefixes } from '@/lib/secretRef'
import { routeOrigin } from '@/lib/toolRoute'
import { Tool, ToolFormField, isToolFormField } from '@/types/management'
import { applyFailure, errorBody, type ApplyResult } from '../common/applyResult'
import { ApplyStatus, useApplyStatus, useAppliedText } from '../common/ApplyStatus'
import { ConflictDialog } from '../common/ConflictDialog'
import { DraftGuard } from '../common/DraftGuard'
import { EntityActions } from '../common/EntityActions'
import type { EntityControls } from '../common/EntityLoader'
import { rejectedField } from '../common/rejectedField'
import { useRequestError } from '../common/useRequestError'
import { NoChangesHint, SaveReviewDialog } from '../common/SaveReviewDialog'
import { useSaveConflict, type OverwriteOutcome } from '../common/useSaveConflict'
import { useDraftBaseline } from '../common/useDraftBaseline'
import { useSaveReview } from '../common/useSaveReview'
import { VersionHistory } from '../common/VersionHistory'
import { ConfigSchemaNotice } from '../common/ConfigSchemaNotice'
import { useConfigSchema } from '../common/useConfigSchema'
import { BasicInfoSection } from './BasicInfoSection'
import { HEADERS_ERROR_ID } from './HeadersGroup'
import { HttpSection } from './HttpSection'
import { type FocusRequest, ParametersSection } from './ParametersSection'
import { RequestPreview } from './RequestPreview'
import { diffTool } from './toolDiff'
import { ToolFormValues, toFormValues, toPayload, toolProblems } from './toolFormValues'

interface ToolFormProps {
  tool?: Tool | null
  /** Só na edição: recarregar, trocar a versão ou só atualizá-la (P3-06). */
  controls?: EntityControls<Tool>
  /** Criar ou excluir com sucesso (volta à lista); a edição salva fica (D-P4-01-4). */
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
  const prefixes = useMemo(
    () => (schema ? referencePrefixes(schema.apiKeyRefFormats) : FALLBACK_PREFIXES),
    [schema]
  )
  // O `***` só se mantém na origem em que foi gravado.
  const loadedOrigin = tool ? routeOrigin(tool.route) : null

  const form = useForm<ToolFormValues>({ defaultValues: toFormValues(tool) })
  const applyStatus = useApplyStatus(form, saveRef)
  const applyRevision = useApplyRevision()
  const appliedText = useAppliedText()
  const { setDefault, changed: draftChanged } = useDraftBaseline(form)
  const { handleSubmit, getValues, setError, setFocus, clearErrors, control, watch } = form
  const parameters = useFieldArray({ control, name: 'parameters' })
  const problems = toolProblems(watch(), prefixes)

  // Tool nova: método padrão que o orquestrador não oferece vira o 1º das
  // opções (o gravado fora delas só se preserva na edição).
  useEffect(() => {
    if (!schema || isEditing) return
    if (!schema.httpMethods.includes(getValues('http_method')))
      setDefault('http_method', schema.httpMethods[0] ?? '')
  }, [schema, isEditing, getValues, setDefault])

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
  // (o orquestrador não diz qual): erro no grupo, foco no 1º valor e o slot do
  // erro (sempre montado) na área visível junto dele (QA1-07);
  // `parameters.<posição>` vai à linha, com foco no nome.
  const markRejected = (field: ToolFormField, data: ToolFormValues) => {
    const error = { type: 'server', message: tc('rejectedByOrchestrator') }
    if (field === 'headers') {
      setError('root.headers', { type: 'server', message: t('form.headersRejected') })
      if (data.headers.length > 0) setFocus('headers.0.value')
      else addHeaderRef.current?.focus()
      document.getElementById(HEADERS_ERROR_ID)?.scrollIntoView({ block: 'nearest' })
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

  // O editor passa ao documento gravado (salvar, restaurar; o header em texto
  // volta oculto, `***`, como numa leitura nova). As edições não salvas somem (D-P4-04-2).
  const showSaved = (saved: Tool, result: ApplyResult) => {
    controls?.set(saved)
    form.reset(toFormValues(saved))
    applyStatus.show(result)
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
      applyStatus.clear()
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
        const revision = applyRevision(result)
        // A edição fica no editor; criar volta à lista (D-P4-01-4).
        if (isEditing) showSaved(result.data as Tool, { status: 'applied', revision })
        else {
          toast.success(t('saved'), { description: appliedText(revision) })
          onSuccess()
        }
        return 'saved'
      }
      // 412: o diálogo de conflito decide (sem toast).
      if (isEditing && response.status === 412) return 'conflict'
      const rejection = await errorBody(response)
      // Não aplicada ou não confirmada (P4-01): o status substitui o toast.
      const failure = applyFailure(response.status, rejection)
      if (failure) {
        dismiss?.()
        applyStatus.show(failure)
        return 'failed'
      }
      // 422: o campo recusado pelo orquestrador ganha o erro (sem o valor).
      const field = rejectedField(response.status, rejection, isToolFormField)
      if (field) {
        // Salvar por cima: o diálogo fecha antes, para o foco ir ao campo com erro.
        dismiss?.()
        markRejected(field, data)
      }
      // 422 de headers: o motivo provável (segredo fora de host confiável,
      // D-QA1-07-1) vai na descrição, com o código.
      if (field === 'headers')
        toast.error(t('saveError'), {
          description: tc('withCode', { message: tf('saveErrorHeaders'), status: response.status })
        })
      // 404 no "salvar por cima": o diálogo diz que foi excluída.
      else if (!(base && response.status === 404))
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

  // O que difere entre o formulário (ou o `data` validado) e uma versão da config
  // (P3-06, P4-02), pelos mesmos valores que o salvar enviaria.
  const compare = useCallback(
    (other: Tool, values: ToolFormValues = getValues()) =>
      diffTool(toPayload(values), toPayload(toFormValues(other)), tf, prefixes),
    [getValues, prefixes, tf]
  )

  // De uma versão para outra (histórico, P4-04), como o formulário as mostraria
  // abertas, mais o estado: restaurar pode ativar ou desativar (D-P4-04-3). Sem
  // `before`, a tool nova.
  const diffVersions = useCallback(
    (before: Tool | null, after: Tool) => [
      ...diffTool(toPayload(toFormValues(after)), toPayload(toFormValues(before)), tf, prefixes),
      ...boolRow('active', t('active'), after.active, before?.active ?? true)
    ],
    [prefixes, tf, t]
  )

  const conflict = useSaveConflict<Tool>({
    url: `/api/tools/${encodeURIComponent(tool?.id ?? '')}`,
    compare,
    overwrite: (current, dismiss) => submit(getValues(), current, dismiss),
    controls
  })

  const review = useSaveReview<ToolFormValues, Tool>({
    form,
    entity: tool,
    compare,
    save: async (data, dismiss) => {
      if ((await submit(data, undefined, dismiss)) === 'conflict' && tool) conflict.start(tool.version)
    }
  })

  const saveDisabled = loading || acting || schemaState.status !== 'ready' || !writable
  // Edição sem mudança (D-P4-02-1): o Salvar segue focável e o envio é barrado.
  // Valor padrão inválido gravado, sem edição: o Salvar precisa levar o foco a ele.
  const unchanged =
    isEditing && !review.hasChanges && !saveDisabled && !problems.defaults.some(Boolean)

  // Submit do formulário
  const onSubmit = async (data: ToolFormValues) => {
    if (focusFirstProblem(toolProblems(data, prefixes))) return
    if (tool) review.open(tool, data)
    else await submit(data)
  }

  // Rascunho (D-QA1-06-4): na edição, o que o Salvar mudaria; na criação, o que
  // difere do formulário aberto sem tocar.
  const hasDraft = () => (tool ? review.hasChanges : draftChanged())

  return (
    <div>
      <div className="mx-auto w-full max-w-6xl space-y-6 p-6">
        {/* Header */}
        <div className="flex flex-wrap items-start gap-4 md:items-center">
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
              {/* Versão lida (D-P4-04-7): muda no 200 do Salvar e do Restaurar. */}
              {tool && (
                <Badge variant="neutral" className="font-mono">
                  {tc('historyVersion', { version: tool.version })}
                </Badge>
              )}
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
          {tool && controls && (
            <div className="ml-auto">
              <VersionHistory
                kind="tools"
                url={`/api/tools/${encodeURIComponent(tool.id)}`}
                entity={tool}
                name={tool.name}
                isDirty={review.hasChanges}
                diffVersions={diffVersions}
                onRestored={showSaved}
                onUnconfirmed={() => applyStatus.show({ status: 'not_confirmed' })}
                onConflict={(chosen) =>
                  conflict.startRestore(tool.version, chosen.version, (current) =>
                    diffVersions(current, chosen.document)
                  )
                }
              />
            </div>
          )}
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
            if (unchanged) return event.preventDefault()
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

            {/* Status do último Salvar (P4-01) e botões de ação. */}
            <div className="xl:col-start-1">
              <ApplyStatus
                kind="tools"
                result={applyStatus.result}
                onReload={controls?.reload}
                isDirty={review.hasChanges}
              />
              {unchanged && (
                <NoChangesHint id={review.hintId} quiet={applyStatus.result?.status === 'applied'} />
              )}
              {/* Abaixo de sm: Salvar, Cancelar e, depois de uma divisória, Excluir. */}
              <div className="flex flex-col-reverse gap-4 sm:flex-row sm:items-center sm:justify-between">
                {tool && controls && (
                  <div className="border-t border-border pt-4 sm:border-0 sm:pt-0">
                    <EntityActions
                      kind="tools"
                      id={tool.id}
                      name={tool.name}
                      version={tool.version}
                      active={tool.active}
                      isDirty={review.hasChanges}
                      disabled={loading}
                      reactivateBody={() =>
                        JSON.stringify(toPayload({ ...toFormValues(tool), active: true }))
                      }
                      onStart={applyStatus.clear}
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
                    disabled={saveDisabled}
                    aria-disabled={unchanged || undefined}
                    aria-describedby={unchanged ? review.hintId : undefined}
                    className="h-10 gap-2 aria-disabled:pointer-events-none aria-disabled:opacity-50 sm:h-9"
                  >
                    <Save className="w-4 h-4" />
                    {loading ? tc('saving') : tc('save')}
                  </Button>
                </div>
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
        {review.dialog && <SaveReviewDialog {...review.dialog} saving={loading} saveRef={saveRef} />}
        {/* Com o diálogo do 412 aberto a saída é dele (não empilha com o aviso). */}
        <DraftGuard hasDraft={hasDraft} paused={conflict.dialog.state.status !== 'closed'} />
      </div>
    </div>
  )
}
