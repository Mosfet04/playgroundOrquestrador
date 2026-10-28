import 'server-only'

import { z } from 'zod'

import { callOrchestrator, type OrchestratorResult } from './client'

// API Admin da config do orquestrador (FA-02, admin_config.py), sempre com a
// chave admin: lista paginada, leitura, criação, troca (PUT) e exclusão. O
// documento leva a `version`, que volta no If-Match do PUT/DELETE (ausente:
// 428; outra: 412). Os ids vêm do browser e entram no path com
// encodeURIComponent (o `..` que sobra é invalid_path no cliente).

export type ConfigKind = 'agents' | 'teams' | 'tools'

// GET /admin/config/{kind} é paginado por offset/limit (teto de 200 por
// página no orquestrador) e traz os inativos.
const PAGE_SIZE = 200
// Teto de páginas (10 000 itens): um `total` absurdo não prende o laço.
const MAX_PAGES = 50

export async function listConfigs<T>(
  kind: ConfigKind,
  item: z.ZodType<T>
): Promise<OrchestratorResult<{ items: T[]; total: number }>> {
  const pageSchema = z.object({
    items: z.array(item).max(PAGE_SIZE),
    total: z.number().int().nonnegative()
  })
  const items: T[] = []
  for (let page = 0; page < MAX_PAGES; page++) {
    const result = await callOrchestrator(`/admin/config/${kind}`, {
      key: 'admin',
      schema: pageSchema,
      query: { offset: String(items.length), limit: String(PAGE_SIZE) }
    })
    if (!result.ok) return result
    items.push(...result.data.items)
    // Página vazia antes do total (a lista encolheu no meio): vale o que veio.
    if (result.data.items.length === 0 || items.length >= result.data.total)
      return { ok: true, data: { items, total: result.data.total } }
  }
  console.warn('[orchestrator] lista da config acima do teto de páginas', { kind })
  return { ok: false, error: 'invalid_response' }
}

const itemPath = (kind: ConfigKind, id: string) =>
  `/admin/config/${kind}/${encodeURIComponent(id)}` as const

export const getConfig = <T>(kind: ConfigKind, id: string, schema: z.ZodType<T>) =>
  callOrchestrator(itemPath(kind, id), { key: 'admin', schema })

export const createConfig = <T>(kind: ConfigKind, body: object, schema: z.ZodType<T>) =>
  callOrchestrator(`/admin/config/${kind}`, { key: 'admin', method: 'POST', body, schema })

export const replaceConfig = <T>(
  kind: ConfigKind,
  id: string,
  body: object,
  version: number,
  schema: z.ZodType<T>
) =>
  callOrchestrator(itemPath(kind, id), {
    key: 'admin',
    method: 'PUT',
    body,
    ifMatch: version,
    schema
  })

// Exclusão de vez (`?hard=true`, D-P2-06-3): o "Excluir" da UI apaga.
export const deleteConfig = (kind: ConfigKind, id: string, version: number) =>
  callOrchestrator(itemPath(kind, id), {
    key: 'admin',
    method: 'DELETE',
    query: { hard: 'true' },
    ifMatch: version,
    schema: z.undefined()
  })

// DELETE lógico (sem `hard`, D-P3-06-3): o orquestrador grava `active: false`
// e devolve o documento com a versão nova; em uso, 409 `used_by`.
export const deactivateConfig = <T>(
  kind: ConfigKind,
  id: string,
  version: number,
  schema: z.ZodType<T>
) => callOrchestrator(itemPath(kind, id), { key: 'admin', method: 'DELETE', ifMatch: version, schema })

// Página do resultado já filtrado (a API Admin não filtra nem busca).
export function pageOf<T>(items: T[], page: number, limit: number) {
  return {
    data: items.slice((page - 1) * limit, page * limit),
    total: items.length,
    page,
    limit,
    totalPages: Math.ceil(items.length / limit)
  }
}

// Busca literal sem diferenciar maiúsculas (substitui o `$regex` do Mongo).
export function matchesSearch(search: string | undefined, texts: (string | null | undefined)[]) {
  if (!search) return true
  const term = search.toLocaleLowerCase()
  return texts.some((text) => text?.toLocaleLowerCase().includes(term))
}

// Campo recusado no 422, com o nome do formulário; fora dele, some (a UI
// mostra o erro geral).
export function withFormField<T>(
  result: OrchestratorResult<T>,
  toFormField: (field: string, indexes?: number[]) => string | undefined
): OrchestratorResult<T> {
  if (result.ok || result.field === undefined) return result
  const { field, indexes, ...failure } = result
  const formField = toFormField(field, indexes)
  return formField ? { ...failure, field: formField } : failure
}
