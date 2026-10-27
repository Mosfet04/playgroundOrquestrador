// Headers da tool HTTP (P3-03). Valor `env:`/`file:` é referência; `***` é o
// valor em texto já gravado, que o orquestrador devolve oculto e mantém se a
// origem da rota não mudar. Nome sensível com texto novo é recusado no cliente
// (D-P3-03-3): a regra é a do orquestrador, duplicada de propósito, que segue
// como autoridade.
import {
  isReference,
  joinReference,
  secretIssue,
  splitReference,
  type SecretIssue
} from '@/lib/secretRef'

export const MASK = '***'

const SENSITIVE_NAME = /^(authorization|proxy-authorization|cookie)$|[-_](key|token)$/i

export const isSensitiveHeader = (name: string) => SENSITIVE_NAME.test(name.trim())

// `hidden`: linha com o valor gravado oculto (`***` que veio do orquestrador).
// `mode`: texto ou referência de segredo (P3-05); no modo Segredo `value` é a
// referência montada e `original` o valor como foi lido (referência gravada
// fora da regra e inalterada não bloqueia, D-P3-05-5).
export type HeaderMode = 'text' | 'secret'
export type HeaderRow = {
  name: string
  value: string
  hidden: boolean
  mode: HeaderMode
  original: string
}
export type HeaderProblem = {
  name?: 'required' | 'duplicate'
  value?: 'required' | 'sensitive' | 'target-required' | SecretIssue
}

// Um problema por campo da linha. Nome repetido (sem diferenciar maiúscula)
// marca a repetição, porque o mapa do documento perderia a linha em silêncio.
export function headerProblems(rows: HeaderRow[], prefixes: string[]): HeaderProblem[] {
  const seen = new Set<string>()
  return rows.map(({ name, value, hidden, mode, original }) => {
    const problem: HeaderProblem = {}
    const key = name.trim().toLowerCase()
    if (key === '') problem.name = 'required'
    else if (seen.has(key)) problem.name = 'duplicate'
    else seen.add(key)
    if (!hidden && mode === 'secret') {
      // Só o formato, sem alvo (vindo do texto que virou referência), é vazio.
      if (joinReference(splitReference(value)) === '') problem.value = 'target-required'
      else if (value !== original) problem.value = secretIssue(value, prefixes)
    } else if (!hidden) {
      if (value.trim() === '') problem.value = 'required'
      else if (isSensitiveHeader(name) && !isReference(value, prefixes)) problem.value = 'sensitive'
    }
    return problem
  })
}
