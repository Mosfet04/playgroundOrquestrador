import 'server-only'

import { z } from 'zod'

import type { ConfigHistoryPage, ConfigVersion } from '@/types/management'

import { callOrchestrator, type OrchestratorResult } from './client'

// API Admin da config do orquestrador (FA-02, admin_config.py), sempre com a
// chave admin: lista paginada, leitura, criação, troca (PUT) e exclusão. O
// documento leva a `version`, que volta no If-Match do PUT/DELETE (ausente:
// 428; outra: 412). Os ids vêm do browser e entram no path com
// encodeURIComponent (o `..` que sobra é invalid_path no cliente).

export type ConfigKind = 'agents' | 'teams' | 'tools'

// `updated_at` do documento (FA-08): ISO 8601 UTC com `Z`, ou `null` sem o
// campo (store YAML, legado do seed). Só exibição: valor que não é data vira
// sem data em vez de derrubar o documento da lista.
export const updatedAtSchema = z.iso
  .datetime()
  .nullish()
  .catch(undefined)
  .transform((value) => value ?? undefined)

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

// 5xx numa escrita (FA-04): a config pode ter sido gravada sem trocar o
// runtime, e o BFF não tem como saber; vira `not_confirmed` (P4-01). A
// leitura que o PUT faz antes segue `server_error`: essa não escreveu.
const unconfirmedIf5xx = <T>(result: OrchestratorResult<T>): OrchestratorResult<T> =>
  result.ok || result.error !== 'server_error' ? result : { ...result, error: 'not_confirmed' }

export const createConfig = async <T>(kind: ConfigKind, body: object, schema: z.ZodType<T>) =>
  unconfirmedIf5xx(
    await callOrchestrator(`/admin/config/${kind}`, { key: 'admin', method: 'POST', body, schema })
  )

export const replaceConfig = async <T>(
  kind: ConfigKind,
  id: string,
  body: object,
  version: number,
  schema: z.ZodType<T>
) =>
  unconfirmedIf5xx(
    await callOrchestrator(itemPath(kind, id), {
      key: 'admin',
      method: 'PUT',
      body,
      ifMatch: version,
      schema
    })
  )

// Exclusão de vez (`?hard=true`, D-P2-06-3): o "Excluir" da UI apaga.
export const deleteConfig = async (kind: ConfigKind, id: string, version: number) =>
  unconfirmedIf5xx(
    await callOrchestrator(itemPath(kind, id), {
      key: 'admin',
      method: 'DELETE',
      query: { hard: 'true' },
      ifMatch: version,
      schema: z.undefined()
    })
  )

// DELETE lógico (sem `hard`, D-P3-06-3): o orquestrador grava `active: false`
// e devolve o documento com a versão nova; em uso, 409 `used_by`.
export const deactivateConfig = async <T>(
  kind: ConfigKind,
  id: string,
  version: number,
  schema: z.ZodType<T>
) =>
  unconfirmedIf5xx(
    await callOrchestrator(itemPath(kind, id), { key: 'admin', method: 'DELETE', ifMatch: version, schema })
  )

// POST /admin/config/reload (FA-04): relê o store, monta tudo e troca o
// runtime, devolvendo a revisão nova. Não mapeia erro: a falha de montagem é
// 500 e o runtime anterior segue servindo (D-P4-05-6); 503 sem a administração.
const reloadSchema = z.object({ runtime_revision: z.number().int().nonnegative() })

export const reloadConfig = async () =>
  unconfirmedIf5xx(
    await callOrchestrator('/admin/config/reload', { key: 'admin', method: 'POST', schema: reloadSchema })
  )

// Histórico do id (FA-05): as escritas pela API, da mais nova à mais antiga,
// com o documento depois de cada uma (header já mascarado; null na remoção) e
// o `diff` só dos campos de topo que mudaram. Store YAML ⇒ `items: []`.
// `limit` vai até o MAX_PAGE_SIZE do orquestrador (200).
export const MAX_HISTORY_PAGE = 200

export type HistoryPage = { offset: number; limit: number }

const historyEntrySchema = z.object({
  version: z.number().int().nonnegative(),
  actor: z.string().min(1).max(128),
  at: z.iso.datetime({ offset: true }),
  diff: z.record(z.string(), z.object({ before: z.unknown(), after: z.unknown() })),
  document: z.record(z.string(), z.unknown()).nullable()
})
// O documento antes da escrita: o depois com o `before` de cada campo do diff
// (`null`: o campo não existia). `fromEntries` cria a chave como dado próprio
// (um campo chamado `__proto__` não troca o protótipo).
const previousOf = (
  document: Record<string, unknown>,
  diff: Record<string, { before?: unknown }>
) =>
  Object.fromEntries([
    ...Object.entries(document).filter(([name]) => !Object.hasOwn(diff, name)),
    ...Object.entries(diff).flatMap(([name, { before }]) => (before == null ? [] : [[name, before]]))
  ])

export async function getConfigHistory<D, T>(
  kind: ConfigKind,
  id: string,
  { offset, limit }: HistoryPage,
  schema: z.ZodType<D>,
  toEntity: (doc: D) => T
): Promise<OrchestratorResult<ConfigHistoryPage<T>>> {
  const result = await callOrchestrator(`${itemPath(kind, id)}/history`, {
    key: 'admin',
    schema: z.object({
      items: z.array(historyEntrySchema).max(limit),
      total: z.number().int().nonnegative()
    }),
    query: { offset: String(offset), limit: String(limit) }
  })
  if (!result.ok) return result
  // O documento do histórico não leva `version` (é a da entrada).
  const parse = (doc: Record<string, unknown>, version: number) => {
    const parsed = schema.safeParse({ ...doc, version })
    return parsed.success ? toEntity(parsed.data) : undefined
  }
  const items: ConfigVersion<T>[] = []
  for (const entry of result.data.items) {
    const { version, actor, at } = entry
    if (entry.document === null) {
      items.push({ version, actor, at, document: null, previous: null })
      continue
    }
    const document = parse(entry.document, version)
    // Criação: o `id` só muda quando o documento passa a existir.
    const created = Object.hasOwn(entry.diff, 'id')
    const previous = created ? null : parse(previousOf(entry.document, entry.diff), version)
    if (document === undefined || previous === undefined) {
      console.warn('[orchestrator] versão do histórico fora do schema', { kind, version })
      return { ok: false, error: 'invalid_response' }
    }
    items.push({ version, actor, at, document, previous })
  }
  return { ok: true, data: { items, total: result.data.total, offset, limit } }
}

// Restaurar (FA-05): o orquestrador volta o id ao documento da `version` pelo
// mesmo caminho do PUT (valida, monta, grava numa versão nova e troca o
// runtime), com o If-Match da versão lida. 404: versão fora do histórico (ou só
// a remoção); 409: store YAML somente leitura.
export const restoreConfig = async <T>(
  kind: ConfigKind,
  id: string,
  version: number,
  current: number,
  schema: z.ZodType<T>
) =>
  unconfirmedIf5xx(
    await callOrchestrator(`${itemPath(kind, id)}/history/${version}/restore`, {
      key: 'admin',
      method: 'POST',
      ifMatch: current,
      schema
    })
  )

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
