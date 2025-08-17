'use client'

import { useState } from 'react'
import { useForm, useFieldArray } from 'react-hook-form'
import { toast } from 'sonner'
import { ArrowLeft, Save, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { TextArea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Tool, CreateToolForm, Parameter } from '@/types/management'

interface ToolFormProps {
  tool?: Tool | null
  onSuccess: () => void
  onCancel: () => void
}

const httpMethods = [
  { value: 'GET', label: 'GET' },
  { value: 'POST', label: 'POST' },
  { value: 'PUT', label: 'PUT' },
  { value: 'DELETE', label: 'DELETE' },
  { value: 'PATCH', label: 'PATCH' }
]

const parameterTypes = [
  { value: 'string', label: 'String' },
  { value: 'number', label: 'Number' },
  { value: 'boolean', label: 'Boolean' },
  { value: 'array', label: 'Array' },
  { value: 'object', label: 'Object' }
]

export function ToolForm({ tool, onSuccess, onCancel }: ToolFormProps) {
  const [loading, setLoading] = useState(false)
  const [headers, setHeaders] = useState<Record<string, string>>(
    tool?.headers || tool?.http_config?.headers || {}
  )

  const isEditing = !!tool

  const {
    register,
    handleSubmit,
    setValue,
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

      const url = isEditing ? `/api/tools/${tool.id}` : '/api/tools'
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
        toast.success(result.message || 'Tool salva com sucesso')
        onSuccess()
      } else {
        toast.error(result.error || 'Erro ao salvar tool')
      }
    } catch (error) {
      console.error('Error saving tool:', error)
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
              {isEditing ? 'Editar Tool' : 'Nova Tool'}
            </h1>
            <p className="text-muted-foreground">
              {isEditing 
                ? 'Edite as configurações da tool' 
                : 'Configure uma nova ferramenta HTTP'
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
              Configure as informações principais da tool
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="id">ID da Tool *</Label>
                <Input
                  id="id"
                  {...register('id', { required: 'ID é obrigatório' })}
                  disabled={isEditing}
                  placeholder="ex: weather-api"
                />
                {errors.id && (
                  <p className="text-sm text-destructive">{errors.id.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="name">Nome *</Label>
                <Input
                  id="name"
                  {...register('name', { required: 'Nome é obrigatório' })}
                  placeholder="ex: Weather API"
                />
                {errors.name && (
                  <p className="text-sm text-destructive">{errors.name.message}</p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Descrição</Label>
              <TextArea
                id="description"
                {...register('description')}
                placeholder="Descreva o que esta tool faz..."
                rows={3}
              />
              {errors.description && (
                <p className="text-sm text-destructive">{errors.description.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="instructions">Instruções</Label>
              <TextArea
                id="instructions"
                {...register('instructions')}
                placeholder="Instruções específicas para uso da tool..."
                rows={2}
              />
            </div>

            <div className="flex items-center space-x-2">
              <Label htmlFor="active">Tool Ativa</Label>
              <Switch
                id="active"
                checked={watch('active')}
                onCheckedChange={(checked) => setValue('active', checked)}
              />
            </div>
          </CardContent>
        </Card>

        {/* Configuração HTTP */}
        <Card>
          <CardHeader>
            <CardTitle>Configuração HTTP</CardTitle>
            <CardDescription>
              Configure os detalhes da requisição HTTP
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Método HTTP *</Label>
                <Select
                  value={watch('http_method')}
                  onValueChange={(value) => setValue('http_method', value as any)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o método" />
                  </SelectTrigger>
                  <SelectContent>
                    {httpMethods.map((method) => (
                      <SelectItem key={method.value} value={method.value}>
                        {method.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="route">Rota/URL *</Label>
                <Input
                  id="route"
                  {...register('route', { required: 'Rota é obrigatória' })}
                  placeholder="https://api.exemplo.com/v1/weather"
                />
                {errors.route && (
                  <p className="text-sm text-destructive">{errors.route.message}</p>
                )}
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
              <Label>Headers HTTP</Label>
              
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
                  placeholder="Chave (ex: Authorization)"
                  value={newHeaderKey}
                  onChange={(e) => setNewHeaderKey(e.target.value)}
                />
                <div className="flex gap-2">
                  <Input
                    placeholder="Valor (ex: Bearer token)"
                    value={newHeaderValue}
                    onChange={(e) => setNewHeaderValue(e.target.value)}
                  />
                  <Button type="button" onClick={addHeader} size="sm">
                    <Plus className="w-4 h-4 text-black" />
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Parâmetros */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Parâmetros</CardTitle>
                <CardDescription>
                  Configure os parâmetros aceitos pela API
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
                className="gap-2 text-black"
              >
                <Plus className="w-4 h-4 text-black" />
                Adicionar
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {fields.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">
                Nenhum parâmetro configurado
              </p>
            ) : (
              <div className="space-y-4">
                {fields.map((field, index) => (
                  <div key={field.id} className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 border rounded-lg">
                    <div className="space-y-2">
                      <Label>Nome *</Label>
                      <Input
                        {...register(`parameters.${index}.name` as const, {
                          required: 'Nome é obrigatório'
                        })}
                        placeholder="nome_parametro"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Tipo *</Label>
                      <Select
                        value={watch(`parameters.${index}.type`)}
                        onValueChange={(value) => setValue(`parameters.${index}.type`, value as any)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {parameterTypes.map((type) => (
                            <SelectItem key={type.value} value={type.value}>
                              {type.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Descrição *</Label>
                      <Input
                        {...register(`parameters.${index}.description` as const, {
                          required: 'Descrição é obrigatória'
                        })}
                        placeholder="Descrição do parâmetro"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Obrigatório</Label>
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
        <div className="flex justify-end gap-4">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
          <Button type="submit" disabled={loading} className="gap-2 text-black">
            <Save className="w-4 h-4" />
            {loading ? 'Salvando...' : 'Salvar Tool'}
          </Button>
        </div>
      </form>
      </div>
    </div>
  )
}
