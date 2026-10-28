'use client'

import { useState } from 'react'
import type { UseFormReturn } from 'react-hook-form'
import { useTranslations } from 'next-intl'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { ProviderOption } from '@/types/management'
import { FieldError } from './FieldError'
import { FieldWarning } from './FieldWarning'

// Campo do formulário que guarda a URL base: a do modelo (agent e team) ou a do
// embedder do RAG (P3-05).
export type BaseUrlName = 'base_url' | 'rag_base_url'
export type BaseUrlForm = Record<BaseUrlName, string | undefined>

// URL base (P3-02): aparece quando o provider a exige, há valor ou o usuário já
// entrou no campo; com `requires_base_url` é obrigatória. `provider` ausente
// (schema não lido ou provider fora das opções) não a exige.
export function BaseUrlField({
  form,
  name,
  vendor,
  provider,
  mustFill,
  className
}: {
  form: UseFormReturn<BaseUrlForm>
  name: BaseUrlName
  vendor: string
  provider: ProviderOption | undefined
  // Exige valor quando o provider exige URL base (padrão); o RAG desligado passa
  // `false`: o orquestrador decide.
  mustFill?: boolean
  className?: string
}) {
  const t = useTranslations('agents.form')
  const { register, watch, formState } = form
  const baseUrl = watch(name)
  // O usuário já entrou no campo: ele fica até trocar de provider. Sumir no blur levantaria o "Salvar" entre o
  // mousedown e o click e o clique se perderia.
  const [entered, setEntered] = useState(false)
  const [enteredFor, setEnteredFor] = useState(vendor)
  if (enteredFor !== vendor) {
    setEnteredFor(vendor)
    setEntered(false)
  }

  const requiresBaseUrl = provider?.requiresBaseUrl ?? false
  // Trocar de provider não apaga o valor; vazio e sem o provider exigir, o
  // campo recolhe com a troca.
  if (!requiresBaseUrl && !baseUrl && !entered) return null
  const notUsed = !!provider && !requiresBaseUrl && !!baseUrl

  const field = register(name, {
    validate: (value) =>
      !requiresBaseUrl || mustFill === false || !!value?.trim() || t('baseUrlRequired', { vendor })
  })
  const error = formState.errors[name]?.message
  const id = name.replace(/_/g, '-')

  return (
    <div className={className ?? 'space-y-2'}>
      <Label htmlFor={name}>
        {t('baseUrl')}
        {requiresBaseUrl ? ' *' : ''}
      </Label>
      <Input
        id={name}
        className="font-mono"
        autoComplete="off"
        spellCheck={false}
        aria-describedby={`${id}-help${error ? ` ${id}-error` : ''}${notUsed ? ` ${id}-warning` : ''}`}
        aria-invalid={error ? true : undefined}
        variant={error ? 'destructive' : undefined}
        {...field}
        onFocus={() => setEntered(true)}
      />
      <p id={`${id}-help`} className="text-xs text-muted-foreground">
        {t('baseUrlHelp')}
      </p>
      <FieldError id={`${id}-error`} message={error} />
      {notUsed && <FieldWarning id={`${id}-warning`}>{t('baseUrlNotUsed', { vendor })}</FieldWarning>}
    </div>
  )
}
