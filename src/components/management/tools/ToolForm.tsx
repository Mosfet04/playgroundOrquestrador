'use client'

import { useState } from 'react'
import { useForm, useFieldArray } from 'react-hook-form'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { ArrowLeft, Save, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { TextArea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Tool, CreateToolForm, PARAMETER_TYPES, isToolFormField } from '@/types/management'
import { DeleteEntityButton } from '../common/DeleteEntityButton'
import { FieldError } from '../common/FieldError'
import { rejectedField } from '../common/rejectedField'
import { useRequestError } from '../common/useRequestError'

interface ToolFormProps {
  tool?: Tool | null
  onSuccess: () => void
}

const httpMethods = [
  { value: 'GET', label: 'GET' },
  { value: 'POST', label: 'POST' },
  { value: 'PUT', label: 'PUT' },
  { value: 'DELETE', label: 'DELETE' },
  { value: 'PATCH', label: 'PATCH' }
]

export function ToolForm({ tool, onSuccess }: ToolFormProps) {
  const [loading, setLoading] = useState(false)
  const [headers, setHeaders] = useState<Record<string, string>>(
    tool?.headers || tool?.http_config?.headers || {}
  )

  const isEditing = !!tool
  const t = useTranslations('tools')
  const tc = useTranslations('common')
  const requestError = useRequestError()

  const {
    register,
    handleSubmit,
    setValue,
    setError,
    clearErrors,
    watch,
    control,
    formState: { errors }
  } = useForm<CreateToolForm>({
    defaultValues: {
      id: tool?.id || '',
      name: tool?.name || '',
      description: tool?.description || '',
      route: tool?.route || (tool?.http_config ? `${tool.http_config.base_url}${tool.http_config.endpoint}` : ''),
      http_method: tool?.http_method || tool?.http_config?.method || 'GET',
      instructions: tool?.instructions || '',
      headers: tool?.headers || tool?.http_config?.headers || {},
      parameters: tool?.parameters || tool?.http_config?.parameters || [],
      active: tool?.active !== undefined ? tool.active : true,
      // Campos legacy para compatibilidade
      base_url: tool?.http_config?.base_url || '',
      method: tool?.http_config?.method || tool?.http_method || 'GET',
      endpoint: tool?.http_config?.endpoint || ''
    }
  })

  // Erro da linha do parâmetro (422 em `parameters.<posição>`); o tipo do RHF
  // mistura o erro da linha com os dos campos dela.
  const parameterError = (index: number) => {
    const message = errors.parameters?.[index]?.message
    return typeof message === 'string' ? message : undefined
  }

  // Idem para os headers (mapa: `message` poderia ser o nome de um header).
  const headersMessage = errors.headers?.message
  const headersError = typeof headersMessage === 'string' ? headersMessage : undefined

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'parameters'
  })

  // Headers management
  const [newHeaderKey, setNewHeaderKey] = useState('')
  const [newHeaderValue, setNewHeaderValue] = useState('')

  const addHeader = () => {
    if (newHeaderKey && newHeaderValue) {
      setHeaders(prev => ({
        ...prev,
        [newHeaderKey]: newHeaderValue
      }))
      setNewHeaderKey('')
      setNewHeaderValue('')
    }
  }

  const removeHeader = (key: string) => {
    setHeaders(prev => {
      const newHeaders = { ...prev }
      delete newHeaders[key]
      return newHeaders
    })
  }

  // Submit do formulário
  const onSubmit = async (data: CreateToolForm) => {
    try {
      setLoading(true)

      const payload = {
        ...data,
        headers
      }

      const url = isEditing ? `/api/tools/${encodeURIComponent(tool.id)}` : '/api/tools'
      const method = isEditing ? 'PUT' : 'POST'

      // A versão lida vai no If-Match (P2-06): se mudou, o orquestrador recusa (412).
      // Header mascarado (`***`) volta como veio: o orquestrador mantém o gravado.
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(isEditing ? { 'If-Match': `"${tool.version}"` } : {})
        },
        body: JSON.stringify(payload)
      })

      const result = response.ok ? await response.json() : null

      if (result?.success) {
        toast.success(t('saved'))
        onSuccess()
      } else {
        // 422: o campo recusado pelo orquestrador ganha o erro (sem o valor).
        const field = await rejectedField(response, isToolFormField)
        if (field)
          setError(field, { type: 'server', message: tc('rejectedByOrchestrator') }, { shouldFocus: true })
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
      console.error('Error saving tool:', error)
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
            <Link href="/tools">
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

      {/* O erro do servidor num campo sem regra (Select, Switch, headers) não
          sai na validação: limpo antes, ele não trava o próximo envio. */}
      <form
        onSubmit={(event) => {
          clearErrors()
          return handleSubmit(onSubmit)(event)
        }}
        className="space-y-6"
      >
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
                  placeholder={tc('example', { value: 'weather-api' })}
                />
                <FieldError message={errors.id?.message} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="name">{t('form.name')}</Label>
                <Input
                  id="name"
                  {...register('name', { required: tc('nameRequired') })}
                  placeholder={tc('example', { value: 'Weather API' })}
                />
                <FieldError message={errors.name?.message} />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">{t('form.description')}</Label>
              <TextArea
                id="description"
                {...register('description', {
                  validate: (value) =>
                    value.trim() !== '' || tc('descriptionRequired')
                })}
                placeholder={t('form.descriptionPlaceholder')}
                rows={3}
              />
              <FieldError message={errors.description?.message} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="instructions">{t('form.instructions')}</Label>
              <TextArea
                id="instructions"
                {...register('instructions')}
                placeholder={t('form.instructionsPlaceholder')}
                rows={2}
              />
              <FieldError message={errors.instructions?.message} />
            </div>

            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <Label htmlFor="active">{t('form.active')}</Label>
                <Switch
                  id="active"
                  checked={watch('active')}
                  onCheckedChange={(checked) => setValue('active', checked)}
                />
              </div>
              <FieldError message={errors.active?.message} />
            </div>
          </CardContent>
        </Card>

        {/* Configuração HTTP */}
        <Card>
          <CardHeader>
            <CardTitle>{t('form.http')}</CardTitle>
            <CardDescription>
              {t('form.httpDescription')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('form.method')}</Label>
                <Select
                  value={watch('http_method')}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  onValueChange={(value) => setValue('http_method', value as any)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('form.methodPlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    {httpMethods.map((method) => (
                      <SelectItem key={method.value} value={method.value}>
                        {method.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldError message={errors.http_method?.message} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="route">{t('form.route')}</Label>
                <Input
                  id="route"
                  {...register('route', { required: t('form.routeRequired') })}
                  placeholder={t('form.routePlaceholder')}
                />
                <FieldError message={errors.route?.message} />
              </div>
            </div>

            {/* Campos legacy para compatibilidade reversa
            <div className="border-t pt-4">
              <h4 className="text-sm font-medium text-muted-foreground mb-2">
                Configuração Legacy (opcional)
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="base_url">URL Base</Label>
                  <Input
                    id="base_url"
                    {...register('base_url')}
                    placeholder="https://api.exemplo.com"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="endpoint">Endpoint</Label>
                  <Input
                    id="endpoint"
                    {...register('endpoint')}
                    placeholder="/v1/weather"
                  />
                </div>
              </div>
            </div> */}

            {/* Headers */}
            <div className="space-y-4">
              <Label>{t('form.headers')}</Label>
              
              {Object.entries(headers).length > 0 && (
                <div className="space-y-2">
                  {Object.entries(headers).map(([key, value]) => (
                    <div key={key} className="flex items-center gap-2 p-2 border rounded">
                      <span className="font-medium">{key}:</span>
                      <span className="flex-1">{value}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeHeader(key)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <Input
                  placeholder={t('form.headerKeyPlaceholder')}
                  value={newHeaderKey}
                  onChange={(e) => setNewHeaderKey(e.target.value)}
                />
                <div className="flex gap-2">
                  <Input
                    placeholder={t('form.headerValuePlaceholder')}
                    value={newHeaderValue}
                    onChange={(e) => setNewHeaderValue(e.target.value)}
                  />
                  <Button
                    type="button"
                    onClick={addHeader}
                    size="sm"
                    aria-label={t('form.addHeader')}
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              <FieldError message={headersError} />
            </div>
          </CardContent>
        </Card>

        {/* Parâmetros */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>{t('form.parameters')}</CardTitle>
                <CardDescription>
                  {t('form.parametersDescription')}
                </CardDescription>
              </div>
              <Button
                type="button"
                onClick={() => append({
                  name: '',
                  type: 'string',
                  description: '',
                  required: false
                })}
                className="gap-2"
              >
                <Plus className="w-4 h-4" />
                {t('form.addParameter')}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {fields.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">
                {t('form.noParameters')}
              </p>
            ) : (
              <div className="space-y-4">
                {fields.map((field, index) => (
                  <div key={field.id} className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 border rounded-lg">
                    {parameterError(index) && (
                      <div className="md:col-span-4">
                        <FieldError
                          id={`parameter-${index}-error`}
                          message={parameterError(index)}
                        />
                      </div>
                    )}
                    <div className="space-y-2">
                      <Label>{t('form.parameterName')}</Label>
                      <Input
                        {...register(`parameters.${index}.name` as const, {
                          required: tc('nameRequired')
                        })}
                        aria-describedby={
                          parameterError(index) ? `parameter-${index}-error` : undefined
                        }
                        placeholder={t('form.parameterNamePlaceholder')}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>{t('form.parameterType')}</Label>
                      <Select
                        value={watch(`parameters.${index}.type`)}
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        onValueChange={(value) => setValue(`parameters.${index}.type`, value as any)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PARAMETER_TYPES.map((type) => (
                            <SelectItem key={type} value={type}>
                              {type}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>{t('form.parameterDescription')}</Label>
                      <Input
                        {...register(`parameters.${index}.description` as const, {
                          required: tc('descriptionRequired')
                        })}
                        placeholder={t('form.parameterDescriptionPlaceholder')}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>{t('form.parameterRequired')}</Label>
                      <div className="flex items-center justify-between">
                        <Switch
                          checked={watch(`parameters.${index}.required`)}
                          onCheckedChange={(checked) => setValue(`parameters.${index}.required`, checked)}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => remove(index)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Botões de ação */}
        {/* Abaixo de sm: Salvar, Cancelar e, depois de uma divisória, Excluir. */}
        <div className="flex flex-col-reverse gap-4 sm:flex-row sm:items-center sm:justify-between">
          {tool && (
            <div className="border-t border-border pt-4 sm:border-0 sm:pt-0">
              <DeleteEntityButton
                url={`/api/tools/${encodeURIComponent(tool.id)}`}
                version={tool.version}
                texts={{
                  label: t('deleteLabel'),
                  title: t('deleteTitle'),
                  description: t('deleteDescription', { name: tool.name }),
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
              <Link href="/tools">{tc('cancel')}</Link>
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
