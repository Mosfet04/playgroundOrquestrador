import 'server-only'

import { z } from 'zod'

import { isTeamFormField, type ModelParams, type TeamConfig, type TeamFormField } from '@/types/management'

import {
  createConfig,
  deleteConfig,
  getConfig,
  listConfigs,
  matchesSearch,
  pageOf,
  replaceConfig,
  withFormField
} from './adminConfig'
import type { OrchestratorResult } from './client'

// CRUD de teams pela API Admin (P3-04), no padrão de agents.ts: o BFF traduz o
// formulário (`factoryIaModel`) para o documento snake_case do TeamConfig do
// orquestrador (modo estrito na escrita) e de volta. O PUT parte do documento
// lido e sobrescreve os campos do formulário: o que ele não conhece (chave
// futura) segue no documento.

// Campo opcional do documento: ausente e `null` são o mesmo (default do
// orquestrador).
const optional = <T extends z.ZodType>(schema: T) =>
  schema.nullish().transform((value) => value ?? undefined)

const teamSchema = z.looseObject({
  id: z.string(),
  nome: z.string(),
  descricao: z.string().nullish(),
  // Leitura tolerante como a do agent: o seed pode gravar a lista de linhas.
  prompt: z.union([z.string(), z.array(z.string())]).nullish(),
  active: z.boolean(),
  member_ids: z.array(z.string()),
  mode: z.string(),
  factory_ia_model: z.string(),
  model: z.string(),
  model_params: optional(z.record(z.string(), z.union([z.string(), z.number(), z.boolean()]))),
  base_url: optional(z.string()),
  api_key_ref: optional(z.string()),
  markdown: optional(z.boolean()),
  add_history_to_context: optional(z.boolean()),
  user_memory_active: optional(z.boolean()),
  summary_active: optional(z.boolean()),
  version: z.number().int().nonnegative()
})
type TeamDocument = z.infer<typeof teamSchema>

// Corpo do TeamForm (validado no route handler, src/app/api/teams/schema.ts).
export type TeamInput = {
  id: string
  nome: string
  factoryIaModel: string
  model: string
  member_ids: string[]
  mode: string
  descricao?: string
  prompt?: string
  active?: boolean
  model_params?: ModelParams
  base_url?: string
  api_key_ref?: string
  markdown?: boolean
  add_history_to_context?: boolean
  user_memory_active?: boolean
  summary_active?: boolean
}

export type TeamFilters = { search?: string; active?: boolean }

const toPrompt = (prompt: TeamDocument['prompt']) =>
  Array.isArray(prompt) ? prompt.join('\n') : (prompt ?? '')

const toTeam = (doc: TeamDocument): TeamConfig => ({
  id: doc.id,
  nome: doc.nome,
  descricao: doc.descricao ?? '',
  prompt: toPrompt(doc.prompt),
  active: doc.active,
  member_ids: doc.member_ids,
  mode: doc.mode,
  factoryIaModel: doc.factory_ia_model,
  model: doc.model,
  model_params: doc.model_params,
  base_url: doc.base_url,
  api_key_ref: doc.api_key_ref,
  markdown: doc.markdown,
  add_history_to_context: doc.add_history_to_context,
  user_memory_active: doc.user_memory_active,
  summary_active: doc.summary_active,
  version: doc.version
})

// Os campos do formulário no documento. Campo opcional vazio ou ausente fica
// `undefined`: o JSON não o leva e, no PUT, ele apaga o do documento atual.
const formFields = (input: Omit<TeamInput, 'id'>) => ({
  nome: input.nome,
  factory_ia_model: input.factoryIaModel,
  model: input.model,
  member_ids: input.member_ids,
  mode: input.mode,
  descricao: input.descricao ?? '',
  prompt: input.prompt ?? '',
  active: input.active ?? true,
  model_params:
    input.model_params && Object.keys(input.model_params).length > 0
      ? input.model_params
      : undefined,
  base_url: input.base_url || undefined,
  api_key_ref: input.api_key_ref || undefined,
  markdown: input.markdown,
  add_history_to_context: input.add_history_to_context,
  user_memory_active: input.user_memory_active,
  summary_active: input.summary_active
})

// Campo do documento recusado no 422 ⇒ campo do formulário. Os nomes são os
// mesmos, menos `factory_ia_model`; o orquestrador não diz qual membro nem qual
// parâmetro (`member_ids` e `model_params` inteiros).
const toFormField = (field: string): TeamFormField | undefined =>
  field === 'factory_ia_model' ? 'factoryIaModel' : isTeamFormField(field) ? field : undefined

const mapped = (result: OrchestratorResult<TeamDocument>): OrchestratorResult<TeamConfig> => {
  const checked = withFormField(result, toFormField)
  return checked.ok ? { ok: true, data: toTeam(checked.data) } : checked
}

export async function listTeams(filters: TeamFilters, page: number, limit: number) {
  const result = await listConfigs('teams', teamSchema)
  if (!result.ok) return result
  const teams = result.data.items
    .filter(
      (team) =>
        (filters.active === undefined || team.active === filters.active) &&
        matchesSearch(filters.search, [team.nome, team.descricao, team.id])
    )
    .map(toTeam)
  return { ok: true as const, data: pageOf(teams, page, limit) }
}

export async function getTeam(id: string) {
  return mapped(await getConfig('teams', id, teamSchema))
}

export async function createTeam(input: TeamInput) {
  return mapped(await createConfig('teams', { id: input.id, ...formFields(input) }, teamSchema))
}

// O If-Match é a versão que o browser leu, não a desta leitura: se o documento
// mudou no meio, o orquestrador responde 412.
export async function replaceTeam(id: string, input: Omit<TeamInput, 'id'>, version: number) {
  const current = await getConfig('teams', id, teamSchema)
  if (!current.ok) return current
  const { version: _read, ...document } = current.data
  void _read
  return mapped(
    await replaceConfig('teams', id, { ...document, ...formFields(input), id }, version, teamSchema)
  )
}

export const deleteTeam = (id: string, version: number) => deleteConfig('teams', id, version)
