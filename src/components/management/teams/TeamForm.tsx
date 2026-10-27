'use client'

import { useEffect, useRef, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { ArrowLeft, Save } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { TextArea } from '@/components/ui/textarea'
import { isTeamFormField, type TeamConfig, type TeamFormField } from '@/types/management'
import { ConfigSchemaNotice } from '../common/ConfigSchemaNotice'
import { DeleteEntityButton } from '../common/DeleteEntityButton'
import { ExecutionSection } from '../common/ExecutionSection'
import { FieldError } from '../common/FieldError'
import { ModelSection } from '../common/ModelSection'
import { rejectedField } from '../common/rejectedField'
import { SectionCard } from '../common/SectionCard'
import { useConfigSchema } from '../common/useConfigSchema'
import { useRequestError } from '../common/useRequestError'
import { MembersSection } from './MembersSection'
import { ModeSection } from './ModeSection'
import { toFormValues, toPayload, type TeamFormValues } from './teamFormValues'
import { useMemberAgents } from './useMemberAgents'

interface TeamFormProps {
  team?: TeamConfig | null
  onSuccess: () => void
}

export function TeamForm({ team, onSuccess }: TeamFormProps) {
  const [loading, setLoading] = useState(false)
  const t = useTranslations('teams')
  const tc = useTranslations('common')
  const requestError = useRequestError()
  const { state: schemaState, retrying, reload: reloadSchema } = useConfigSchema()
  const members = useMemberAgents()
  const membersRef = useRef<HTMLFieldSetElement>(null)
  const modeRef = useRef<HTMLFieldSetElement>(null)

  const isEditing = !!team

  const form = useForm<TeamFormValues>({ defaultValues: toFormValues(team) })
  const { register, handleSubmit, setValue, getValues, setError, setFocus, clearErrors, control } = form
  const { errors } = form.formState

  // Opções do orquestrador (P3-01): sem schema os selects ficam desabilitados;
  // config só leitura desabilita o formulário todo.
  const schema = schemaState.status === 'ready' ? schemaState.schema : undefined
  const writable = schema?.writable ?? true
  // O `fieldset disabled` não segura o pointerdown num <button> (Chromium): o
  // Radix abre o Select nele, então o Select precisa estar desabilitado por si.
  const selectsDisabled = !schema || !writable

  // Team novo com provider ou modo que o orquestrador não oferece: o 1º das
  // opções. O gravado fora delas só se preserva na edição.
  useEffect(() => {
    if (!schema || isEditing) return
    if (!schema.chatProviders.some(({ name }) => name === getValues('factoryIaModel')))
      setValue('factoryIaModel', schema.chatProviders[0]?.name ?? '')
    if (!schema.team.modes.includes(getValues('mode')))
      setValue('mode', schema.team.modes[0] ?? '')
  }, [schema, isEditing, getValues, setValue])

  // Campo de execução ausente (team novo ou sem o campo) vale o default do
  // schema (`team`).
  useEffect(() => {
    if (!schema) return
    const flags = [
      ['markdown', schema.team.markdown],
      ['add_history_to_context', schema.team.addHistoryToContext]
    ] as const
    for (const [field, value] of flags) if (getValues(field) === undefined) setValue(field, value)
  }, [schema, getValues, setValue])

  // Erro do orquestrador no campo recusado, sem o valor. `member_ids` e `mode`
  // levam o foco ao 1º membro marcado e ao cartão marcado; `model_params` é um
  // grupo (o orquestrador não diz qual parâmetro): erro no grupo e foco no 1º valor.
  const markRejected = (field: TeamFormField, params: TeamFormValues['params']) => {
    const error = { type: 'server', message: tc('rejectedByOrchestrator') }
    if (field === 'member_ids') {
      setError(field, error)
      membersRef.current?.querySelector<HTMLInputElement>('input:checked')?.focus()
    } else if (field === 'mode') {
      setError(field, error)
      modeRef.current?.querySelector<HTMLInputElement>('input:checked')?.focus()
    } else if (field === 'model_params') {
      setError('root.params', error)
      if (params.length > 0) setFocus('params.0.value')
    } else setError(field, error, { shouldFocus: true })
  }

  const onSubmit = async (data: TeamFormValues) => {
    try {
      setLoading(true)
      const url = isEditing ? `/api/teams/${encodeURIComponent(team.id)}` : '/api/teams'
      // A versão lida vai no If-Match (P2-06): se mudou, o orquestrador recusa (412).
      const response = await fetch(url, {
        method: isEditing ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(isEditing ? { 'If-Match': `"${team.version}"` } : {})
        },
        body: JSON.stringify(toPayload(data))
      })
      const result = response.ok ? await response.json() : null

      if (result?.success) {
        toast.success(t('saved'))
        onSuccess()
      } else {
        // 422: o campo recusado pelo orquestrador ganha o erro (sem o valor).
        const field = await rejectedField(response, isTeamFormField)
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
      console.error('Error saving team:', error)
      toast.error(requestError(undefined, { failed: t('saveError') }))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <div className="mx-auto max-w-4xl space-y-6 p-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" asChild className="gap-2">
            <Link href="/teams">
              <ArrowLeft className="size-4" aria-hidden="true" />
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

        {/* O erro do servidor num campo sem regra (Select, Switch) não sai na
            validação: limpo antes, ele não trava o próximo envio. */}
        <form
          noValidate
          className="space-y-6"
          onSubmit={(event) => {
            clearErrors()
            return handleSubmit(onSubmit)(event)
          }}
        >
          <fieldset disabled={!writable} className="min-w-0">
            <SectionCard
              id="team-identity"
              title={t('form.basicInfo')}
              description={t('form.basicInfoDescription')}
            >
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="id">{t('form.id')}</Label>
                  <Input
                    id="id"
                    {...register('id', { required: tc('idRequired') })}
                    disabled={isEditing}
                    placeholder={tc('example', { value: 'team-1' })}
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
          </fieldset>

          {/* Fora do fieldset: a busca de membros segue utilizável com a config
              só leitura (não é campo do documento); marcar fica desabilitado. */}
          <Controller
            control={control}
            name="member_ids"
            rules={{ validate: (ids) => ids.length > 0 || t('form.membersRequired') }}
            render={({ field }) => (
              <MembersSection
                agents={members.state}
                selected={field.value}
                onChange={field.onChange}
                error={errors.member_ids?.message}
                locked={!writable}
                firstRef={field.ref}
                groupRef={membersRef}
                onRetry={members.reload}
              />
            )}
          />

          <fieldset disabled={!writable} className="min-w-0 space-y-6">
            <Controller
              control={control}
              name="mode"
              render={({ field }) => (
                <ModeSection
                  modes={schema?.team.modes}
                  status={schemaState.status}
                  value={field.value}
                  onChange={field.onChange}
                  error={errors.mode?.message}
                  locked={selectsDisabled}
                  groupRef={modeRef}
                />
              )}
            />

            <ModelSection
              entity="team"
              form={form}
              schema={schema}
              status={schemaState.status}
              storedApiKeyRef={team?.api_key_ref ?? ''}
              locked={selectsDisabled}
            />

            <SectionCard
              id="team-instructions"
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
                  className="min-h-44"
                />
                <FieldError message={errors.prompt?.message} />
              </div>
            </SectionCard>

            <ExecutionSection
              entity="team"
              form={form}
              schema={schema}
              status={schemaState.status}
              locked={selectsDisabled}
            />

            {/* Abaixo de sm: Salvar, Cancelar e, depois de uma divisória, Excluir. */}
            <div className="flex flex-col-reverse gap-4 sm:flex-row sm:items-center sm:justify-between">
              {team && (
                <div className="border-t border-border pt-4 sm:border-0 sm:pt-0">
                  <DeleteEntityButton
                    url={`/api/teams/${encodeURIComponent(team.id)}`}
                    version={team.version}
                    texts={{
                      label: t('deleteLabel'),
                      title: t('deleteTitle'),
                      description: t('deleteDescription', { name: team.nome }),
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
                  <Link href="/teams">{tc('cancel')}</Link>
                </Button>
                <Button
                  type="submit"
                  disabled={loading || schemaState.status !== 'ready' || members.state.status !== 'ready'}
                  className="h-10 gap-2 sm:h-9"
                >
                  <Save className="size-4" aria-hidden="true" />
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
