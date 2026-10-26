// Headers da tool HTTP (P3-03). Valor `env:`/`file:` é referência; `***` é o
// valor em texto já gravado, que o orquestrador devolve oculto e mantém se a
// origem da rota não mudar. Nome sensível com texto novo é recusado no cliente
// (D-P3-03-3): a regra é a do orquestrador, duplicada de propósito, que segue
// como autoridade.
export const MASK = '***'

const SENSITIVE_NAME = /^(authorization|proxy-authorization|cookie)$|[-_](key|token)$/i

export const isSensitiveHeader = (name: string) => SENSITIVE_NAME.test(name.trim())

// `api_key_ref.formats` do schema (`env:<PROVEDOR>_API_KEY`) -> prefixos (`env:`).
export const referencePrefixes = (formats: string[]) =>
  formats.map((format) => format.slice(0, format.indexOf(':') + 1)).filter(Boolean)

export const isReference = (value: string, prefixes: string[]) =>
  prefixes.some((prefix) => value.startsWith(prefix))

// `hidden`: linha com o valor gravado oculto (`***` que veio do orquestrador).
export type HeaderRow = { name: string; value: string; hidden: boolean }
export type HeaderProblem = { name?: 'required' | 'duplicate'; value?: 'required' | 'sensitive' }

// Um problema por campo da linha. Nome repetido (sem diferenciar maiúscula)
// marca a repetição, porque o mapa do documento perderia a linha em silêncio.
export function headerProblems(rows: HeaderRow[], prefixes: string[]): HeaderProblem[] {
  const seen = new Set<string>()
  return rows.map(({ name, value, hidden }) => {
    const problem: HeaderProblem = {}
    const key = name.trim().toLowerCase()
    if (key === '') problem.name = 'required'
    else if (seen.has(key)) problem.name = 'duplicate'
    else seen.add(key)
    if (!hidden) {
      if (value.trim() === '') problem.value = 'required'
      else if (isSensitiveHeader(name) && !isReference(value, prefixes)) problem.value = 'sensitive'
    }
    return problem
  })
}
