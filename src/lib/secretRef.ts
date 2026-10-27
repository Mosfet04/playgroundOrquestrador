// Referência de segredo (`env:`/`file:`, P3-05). A regra é a de
// `parse_secret_ref` do orquestrador, duplicada de propósito (D-P3-05-1): ele
// segue como autoridade e recusa com 422. Aqui só se barra, antes do envio, o
// que ele recusaria. Nunca o valor do segredo: só de onde ler.

// `api_key_ref.formats` do schema (`env:<PROVEDOR>_API_KEY`) -> prefixos (`env:`).
export const referencePrefixes = (formats: string[]) =>
  formats.map((format) => format.slice(0, format.indexOf(':') + 1)).filter(Boolean)

export const isReference = (value: string, prefixes: string[]) =>
  prefixes.some((prefix) => value.startsWith(prefix))

export type SecretParts = { prefix: string; target: string }

// `env:` só aponta para chave de provider (o orquestrador não deixa ler
// qualquer variável do processo): até 128 caracteres.
const ENV_TARGET = /^[A-Z][A-Z0-9_]{0,119}_API_KEY$/
const SCHEME = /^[a-z][a-z0-9_+.-]*:/

// Formato (`env:`) + alvo. Qualquer esquema em minúsculas é formato, mesmo o
// que o schema não oferece (`vault:`): o valor gravado fora da regra continua
// visível e editável. Sem esquema, o texto todo é o alvo.
export function splitReference(value: string): SecretParts {
  const prefix = SCHEME.exec(value)?.[0] ?? ''
  return { prefix, target: value.slice(prefix.length) }
}

// Alvo vazio ⇒ vazio (sem chave própria): o formato sozinho não é referência.
export function joinReference({ prefix, target }: SecretParts) {
  const trimmed = target.trim()
  return trimmed === '' ? '' : prefix + trimmed
}

// Texto digitado ou colado no alvo que já traz um formato do schema.
export function leadingReference(text: string, prefixes: string[]): SecretParts | undefined {
  const prefix = prefixes.find((candidate) => text.startsWith(candidate))
  return prefix === undefined ? undefined : { prefix, target: text.slice(prefix.length) }
}

export type SecretIssue = 'format' | 'env' | 'file'

// O que o orquestrador recusaria numa referência preenchida; `undefined` = ok.
export function secretIssue(value: string, prefixes: string[]): SecretIssue | undefined {
  const { prefix, target } = splitReference(value)
  if (!prefixes.includes(prefix)) return 'format'
  if (prefix === 'env:') return ENV_TARGET.test(target) ? undefined : 'env'
  if (prefix === 'file:') return target.startsWith('/') && !target.includes('\0') ? undefined : 'file'
  return undefined
}

export type SecretWarning = 'no-format' | 'unknown-format' | 'out-of-rule'

// Valor gravado fora da regra: abre visível e editável, e enquanto não for
// alterado não bloqueia o envio (D-P3-05-5).
export function secretWarning(value: string, prefixes: string[]): SecretWarning | undefined {
  // Sem formatos (schema carregando ou com falha) não há com o que comparar.
  if (value === '' || prefixes.length === 0 || secretIssue(value, prefixes) === undefined)
    return undefined
  const { prefix } = splitReference(value)
  if (prefix === '') return 'no-format'
  return prefixes.includes(prefix) ? 'out-of-rule' : 'unknown-format'
}
