import { parseDefault } from '@/lib/toolDefault'
import { isReference } from '@/lib/secretRef'
import { MASK } from '@/lib/toolHeaders'
import { PLACEHOLDER, routePlaceholders } from '@/lib/toolRoute'

// Preview da requisição (P3-03), como o orquestrador a monta
// (http_tool_factory.py): `{x}` da rota pelo valor, os demais parâmetros em
// query (GET/DELETE) ou corpo JSON (POST/PUT/PATCH). Ilustrativo: o encode é o
// `encodeURIComponent`, que difere do `quote(safe="")` do Python em `!'()*`.
// Alinhado ao que o orquestrador faz (httpx 0.28): booleano na rota é
// `True`/`False` (`str()` do Python), na query `true`/`false`, e array na query
// vira chave repetida (`ids=1&ids=2`).
export type Part = { text: string; mark?: 'default' | 'placeholder' }

export interface BuiltRequest {
  method: string
  url: Part[]
  where: 'query' | 'body'
  extras: { name: string; value: Part }[]
  // Texto comum nunca sai daqui: `masked` e `value` vazio.
  headers: { name: string; value: string; masked: boolean }[]
}

export function buildRequest({
  method,
  route,
  parameters,
  headers,
  prefixes
}: {
  method: string
  route: string
  parameters: { name: string; type: string; defaultText: string }[]
  headers: { name: string; value: string }[]
  prefixes: string[]
}): BuiltRequest {
  const upper = method.toUpperCase()
  const where = upper === 'GET' || upper === 'DELETE' ? 'query' : 'body'

  const exampleOf = (name: string) => {
    const found = parameters.find((parameter) => parameter.name.trim() === name)
    const parsed = found ? parseDefault(found.type, found.defaultText) : undefined
    return parsed?.ok ? parsed.value : undefined
  }
  const plain = (value: unknown) =>
    typeof value === 'object' ? JSON.stringify(value) : String(value)
  // Na rota o orquestrador usa `str(valor)` do Python: `True`/`False`.
  const inPath = (value: unknown) =>
    typeof value === 'boolean' ? (value ? 'True' : 'False') : plain(value)
  const placeholder = (name: string): Part => ({ text: `{${name}}`, mark: 'placeholder' })

  const url: Part[] = []
  if (/^https?:\/\//i.test(route)) {
    let last = 0
    for (const match of route.matchAll(PLACEHOLDER)) {
      const value = exampleOf(match[1])
      if (match.index > last) url.push({ text: route.slice(last, match.index) })
      url.push(
        value === undefined
          ? placeholder(match[1])
          : { text: encodeURIComponent(inPath(value)), mark: 'default' }
      )
      last = match.index + match[0].length
    }
    if (last < route.length) url.push({ text: route.slice(last) })
  } else url.push({ text: route })

  const inRoute = routePlaceholders(route)
  const extras = parameters
    .map(({ name, ...rest }) => ({ ...rest, name: name.trim() }))
    .filter(({ name }) => name !== '' && !inRoute.includes(name))
    .flatMap(({ name }): BuiltRequest['extras'] => {
      const value = exampleOf(name)
      if (value === undefined) return [{ name, value: placeholder(name) }]
      const mark = 'default' as const
      if (where === 'body') return [{ name, value: { text: JSON.stringify(value), mark } }]
      // Query: array vira chave repetida; o resto, o valor codificado.
      return (Array.isArray(value) ? value : [value]).map((item) => ({
        name,
        value: { text: encodeURIComponent(plain(item)), mark }
      }))
    })

  return {
    method: upper,
    url,
    where,
    extras,
    headers: headers
      .filter(({ name }) => name !== '')
      .map(({ name, value }) =>
        value === '' || value === MASK || isReference(value, prefixes)
          ? { name, value, masked: false }
          : { name, value: '', masked: true }
      )
  }
}
