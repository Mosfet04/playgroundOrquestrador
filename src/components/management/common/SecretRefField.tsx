'use client'

import { useId, useImperativeHandle, useRef, useState, type Ref } from 'react'
import { useTranslations } from 'next-intl'
import { CircleAlert } from 'lucide-react'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Chip, LiveStatus } from '@/components/ui/loading'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  joinReference,
  leadingReference,
  secretIssue,
  secretWarning,
  splitReference,
  type SecretIssue,
  type SecretParts
} from '@/lib/secretRef'
import { cn } from '@/lib/utils'
import { FieldWarning } from './FieldWarning'
import { withCurrent } from './useConfigSchema'

// Seletor de segredo único (P3-05, D-P3-05-1): formato (`env:`/`file:`, do
// schema) + alvo digitado, e a referência montada à vista. O valor do formulário
// é só a referência (`env:OPENAI_API_KEY`), nunca o valor do segredo: o
// orquestrador resolve no servidor dele. Nada lista variáveis nem arquivos.
// Usado no modelo do agent, no do líder do team, no embedder e nos headers.

export type SecretFocus = { focus: () => void }
export type SchemaStatus = 'loading' | 'error' | 'ready'

// Mensagens do seletor e do que o formulário valida nele.
export function useSecretRefTexts(prefixes: string[]) {
  const t = useTranslations('secretRef')
  const formats = prefixes.join(', ')
  return {
    message(issue: SecretIssue | 'target-required') {
      if (issue === 'target-required') return t('errorTargetRequired')
      if (issue === 'env') return t('errorEnv', { suffix: '_API_KEY', example: 'OPENAI_API_KEY' })
      if (issue === 'file') return t('errorFile', { example: '/run/secrets/openai_key' })
      return t('errorFormat', { formats })
    },
    warning(value: string) {
      const warning = secretWarning(value, prefixes)
      if (warning === 'out-of-rule') return t('warnOutOfRule')
      if (warning === 'no-format') return t('warnNoFormat', { formats })
      if (warning === 'unknown-format')
        return t('warnUnknownFormat', { format: splitReference(value).prefix, formats })
      return undefined
    }
  }
}

// `validate` do react-hook-form para um campo `api_key_ref` opcional: vazio e o
// valor gravado (inalterado) passam; o resto, pela regra (D-P3-05-5).
export function useSecretRefValidate(prefixes: string[], original: string) {
  const texts = useSecretRefTexts(prefixes)
  return (value: string | undefined) => {
    const ref = value?.trim() ?? ''
    if (ref === '' || ref === original) return true
    const issue = secretIssue(ref, prefixes)
    return issue ? texts.message(issue) : true
  }
}

// Formato + alvo do valor. O valor é a referência montada; o formato escolhido
// sem alvo fica só aqui (a referência vazia não o guarda).
export function useSecretParts(
  value: string,
  onChange: (value: string) => void,
  prefixes: string[]
) {
  const t = useTranslations('secretRef')
  const [parts, setParts] = useState(() => splitReference(value))
  const [announcement, setAnnouncement] = useState('')

  // Valor trocado por fora (descartar, "Usar segredo", cancelar): refaz as partes.
  // `file:` sozinho vale como vazio (o formato fica nas partes).
  if (joinReference(splitReference(value)) !== joinReference(parts)) setParts(splitReference(value))

  // Sem formato e sem alvo vale o 1º do schema; com alvo sem formato (valor
  // gravado sem prefixo) o Select fica vazio.
  const prefix = parts.prefix || (parts.target === '' ? (prefixes[0] ?? '') : '')
  const apply = (next: SecretParts) => {
    setParts(next)
    onChange(joinReference(next))
  }

  return {
    value,
    prefix,
    target: parts.target,
    announcement,
    selectPrefix: (picked: string) => apply({ prefix: picked, target: parts.target }),
    // Referência completa colada ou digitada: o formato vai ao Select.
    changeTarget: (text: string) => {
      const leading = leadingReference(text, prefixes)
      setAnnouncement(leading ? t('formatApplied', { format: leading.prefix }) : '')
      apply(leading ?? { prefix, target: text })
    }
  }
}

type SecretModel = ReturnType<typeof useSecretParts>

// Par Select (formato) + Input (alvo), colados.
export function SecretRefPair({
  id,
  model,
  prefixes,
  disabled,
  invalid,
  describedBy,
  nameSuffix,
  focusRef
}: {
  id: string
  model: SecretModel
  prefixes: string[]
  // Sem schema ou só leitura: o Select precisa de `disabled` próprio.
  disabled: boolean
  invalid: boolean
  describedBy?: string
  // Nome da linha nos `aria-label` dos headers: "Formato (X-Api-Key)".
  nameSuffix?: string
  // Foco do campo para o formulário (erro): no formato se o erro é dele.
  focusRef?: Ref<SecretFocus>
}) {
  const t = useTranslations('secretRef')
  const formatRef = useRef<HTMLButtonElement | null>(null)
  const targetRef = useRef<HTMLInputElement | null>(null)
  const { prefix, value } = model
  const suffix = nameSuffix ? ` (${nameSuffix})` : ''
  const formatInvalid = value !== '' && secretIssue(value, prefixes) === 'format'

  useImperativeHandle(
    focusRef,
    () => ({
      focus: () => {
        if (formatInvalid) formatRef.current?.focus()
        else {
          const input = targetRef.current
          input?.focus()
          input?.setSelectionRange(input.value.length, input.value.length)
        }
      }
    }),
    [formatInvalid]
  )

  const targetLabel =
    prefix === 'env:' ? t('targetEnv') : prefix === 'file:' ? t('targetFile') : t('targetOther')

  return (
    <>
      <div className="flex w-full">
        <Select value={prefix} disabled={disabled} onValueChange={model.selectPrefix}>
          <SelectTrigger
            ref={formatRef}
            id={`${id}-format`}
            aria-label={`${t('format')}${suffix}`}
            aria-invalid={invalid || undefined}
            className={cn(
              'h-10 w-[92px] shrink-0 rounded-r-none bg-muted font-mono',
              invalid && 'border-destructive'
            )}
          >
            <SelectValue placeholder={t('format')} />
          </SelectTrigger>
          <SelectContent>
            {withCurrent(prefixes, prefix).map((option) => (
              <SelectItem key={option} value={option} className="font-mono">
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          ref={targetRef}
          id={id}
          type="text"
          value={model.target}
          disabled={disabled}
          autoComplete="off"
          spellCheck={false}
          placeholder={
            prefix === 'env:' ? t('placeholderEnv') : prefix === 'file:' ? t('placeholderFile') : undefined
          }
          aria-label={`${targetLabel}${suffix}`}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          variant={invalid ? 'destructive' : undefined}
          className="rounded-l-none border-l-0 font-mono"
          onChange={(event) => model.changeTarget(event.target.value)}
        />
      </div>
      <span role="status" className="sr-only">
        {model.announcement}
      </span>
    </>
  )
}

const EMPTY = '—'

// "Gravada como": a referência montada, que quebra linha em vez de cortar.
export function AssembledRef({ id, value }: { id?: string; value: string }) {
  const t = useTranslations('secretRef')
  return (
    <p
      id={id}
      className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"
    >
      {t('assembled')}{' '}
      <Chip className="h-auto min-h-6 whitespace-normal break-all py-0.5">
        {value === '' ? (
          <>
            <span aria-hidden="true">{EMPTY}</span>
            <span className="sr-only">{t('assembledEmpty')}</span>
          </>
        ) : (
          value
        )}
      </Chip>
    </p>
  )
}

export function SecretRefField({
  id,
  label,
  emptyHelp,
  value,
  original,
  onChange,
  prefixes,
  status,
  locked,
  error,
  focusRef,
  className
}: {
  id: string
  label: string
  // "Vazio: o agente não define chave própria."
  emptyHelp: string
  value: string
  // Valor como foi lido: gravado fora da regra e inalterado só avisa.
  original: string
  onChange: (value: string) => void
  prefixes: string[]
  status: SchemaStatus
  // Sem schema ou store só leitura.
  locked: boolean
  error?: string
  focusRef?: Ref<SecretFocus>
  className?: string
}) {
  const t = useTranslations('secretRef')
  const texts = useSecretRefTexts(prefixes)
  const uid = useId()
  const outId = `${uid}-out`
  const helpId = `${uid}-help`
  const errorId = `${uid}-error`
  const warningId = `${uid}-warning`
  const model = useSecretParts(value, onChange, prefixes)
  const warning = !error && value === original ? texts.warning(value) : undefined

  const formatHelp =
    status === 'error'
      ? t('unavailable')
      : model.prefix === 'env:'
        ? t.rich('helpEnv', {
            suffix: '_API_KEY',
            code: (chunks) => <code className="font-mono">{chunks}</code>
          })
        : model.prefix === 'file:'
          ? t('helpFile')
          : model.prefix === ''
            ? t('helpPick')
            : t('helpOther')

  return (
    <div role="group" aria-labelledby={`${uid}-label`} aria-busy={status === 'loading' || undefined} className={cn('space-y-2', className)}>
      <Label id={`${uid}-label`} htmlFor={id}>
        {label}
      </Label>
      <SecretRefPair
        id={id}
        model={model}
        prefixes={prefixes}
        disabled={locked}
        invalid={!!error}
        describedBy={[outId, helpId, error ? errorId : '', warning ? warningId : '']
          .filter(Boolean)
          .join(' ')}
        focusRef={focusRef}
      />
      <AssembledRef id={outId} value={value} />
      <p id={helpId} className="text-xs text-muted-foreground">
        {t('helpLead')} {formatHelp} {emptyHelp}
      </p>
      {status === 'loading' && <LiveStatus>{t('loading')}</LiveStatus>}
      {error && (
        <p id={errorId} className="flex items-start gap-1 text-sm text-destructive">
          <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </p>
      )}
      {warning && <FieldWarning id={warningId}>{warning}</FieldWarning>}
    </div>
  )
}
