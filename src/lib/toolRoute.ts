// Rota da tool HTTP (P3-03). Placeholder = `{nome}` com qualquer texto sem
// chaves entre elas, a mesma regra do orquestrador (http_tool_factory.py:
// `\{([^{}]+)\}`), que descarta no runtime a tool cuja rota tem placeholder
// sem parâmetro de mesmo nome (só log). O editor o recusa antes (D-P3-03-2).
export const PLACEHOLDER = /\{([^{}]+)\}/g

export const routePlaceholders = (route: string): string[] => [
  ...new Set([...route.matchAll(PLACEHOLDER)].map(([, name]) => name))
]

// O BFF grava o nome do parâmetro sem espaço nas pontas (`trim`); o placeholder
// da rota vale como está. Por isso o parâmetro é comparado já aparado, e o
// placeholder com espaço nas pontas (ou só espaço) não casa com nenhum nome: o
// orquestrador descartaria a tool.
export const hasEdgeSpace = (name: string) => name !== name.trim() || name.trim() === ''

export const spacedPlaceholders = (route: string): string[] =>
  routePlaceholders(route).filter(hasEdgeSpace)

// Placeholders válidos da rota sem parâmetro de mesmo nome (caixa conta).
export const missingParams = (route: string, names: string[]): string[] => {
  const trimmed = names.map((name) => name.trim())
  return routePlaceholders(route).filter((name) => !hasEdgeSpace(name) && !trimmed.includes(name))
}

// Esquema + host + porta como escritos (o orquestrador só mantém o header
// oculto `***` na mesma origem). Sem esquema http(s): sem origem.
export function routeOrigin(route: string): string | null {
  const parts = /^(https?):\/\/(?:[^@/?#]*@)?(\[[^\]]*\]|[^:/?#]*)(?::(\d*))?(?:[/?#]|$)/i.exec(route)
  if (!parts) return null
  const [, scheme, host, port] = parts
  return `${scheme.toLowerCase()}://${host.toLowerCase()}${port ? `:${port}` : ''}`
}
