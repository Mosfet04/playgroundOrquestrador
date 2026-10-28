import 'server-only'

import { z } from 'zod'

import type { AgentConfig, AgentFormField, ModelParams } from '@/types/management'

import {
  createConfig,
  deactivateConfig,
  deleteConfig,
  getConfig,
  listConfigs,
  matchesSearch,
  pageOf,
  replaceConfig,
  withFormField
} from './adminConfig'
import type { OrchestratorResult } from './client'

// CRUD de agents pela API Admin (P2-06), com o formulário de hoje: o BFF
// traduz camelCase/rag_* para o documento snake_case do orquestrador
// (config_documents.py, modo estrito) e de volta. O snapshot OpenAPI não
// descreve o corpo de /admin/config/*: o formato é o do AgentConfig do
// orquestrador (entity_document + `version`).

// Só os campos que o formulário lê; o resto do documento passa adiante sem
// validar (`looseObject`), para o PUT não zerar o que a UI não mostra.
// Campo opcional do documento: ausente e `null` são o mesmo (o orquestrador
// usa o default).
const optional = <T extends z.ZodType>(schema: T) =>
  schema.nullish().transform((value) => value ?? undefined)

const modelParamsSchema = z.record(z.string(), z.union([z.string(), z.number(), z.boolean()]))

const ragSchema = z.looseObject({
  active: z.boolean(),
  doc_name: z.string().nullish(),
  model: z.string().nullish(),
  factory_ia_model: z.string().nullish(),
  search_strategy: optional(z.string()),
  model_params: optional(modelParamsSchema),
  base_url: optional(z.string()),
  api_key_ref: optional(z.string())
})

const agentSchema = z.looseObject({
  id: z.string(),
  nome: z.string(),
  model: z.string(),
  factory_ia_model: z.string(),
  descricao: z.string().nullish(),
  // Seed do orquestrador (mongo-init, config.example.yaml) grava a lista de
  // linhas, que a leitura tolerante devolve; a escrita estrita só aceita texto
  // (D-P2-06-9). Outro formato derruba a lista (D-P2-06-10).
  prompt: z.union([z.string(), z.array(z.string())]),
  active: z.boolean(),
  tools_ids: z.array(z.string()).nullish(),
  rag_config: ragSchema.nullish(),
  model_params: optional(modelParamsSchema),
  base_url: optional(z.string()),
  api_key_ref: optional(z.string()),
  markdown: optional(z.boolean()),
  add_history_to_context: optional(z.boolean()),
  num_history_runs: optional(z.number().int()),
  add_datetime_to_context: optional(z.boolean()),
  reasoning: optional(z.boolean()),
  user_memory_active: optional(z.boolean()),
  summary_active: optional(z.boolean()),
  version: z.number().int().nonnegative()
})
type AgentDocument = z.infer<typeof agentSchema>

// Corpo do AgentForm (validado no route handler, src/app/api/agents/schema.ts).
export type AgentInput = {
  id: string
  nome: string
  model: string
  factoryIaModel: string
  descricao?: string
  prompt?: string
  active?: boolean
  tools_ids?: string[]
  rag_active?: boolean
  rag_doc_name?: string
  rag_model?: string
  rag_factoryIaModel?: string
  rag_search_strategy?: string
  rag_model_params?: ModelParams
  rag_base_url?: string
  rag_api_key_ref?: string
  model_params?: ModelParams
  base_url?: string
  api_key_ref?: string
  markdown?: boolean
  add_history_to_context?: boolean
  num_history_runs?: number
  add_datetime_to_context?: boolean
  reasoning?: boolean
  user_memory_active?: boolean
  summary_active?: boolean
}

export type AgentFilters = {
  search?: string
  active?: boolean
  factoryIaModel?: string
}

const toAgent = (doc: AgentDocument): AgentConfig => ({
  id: doc.id,
  nome: doc.nome,
  model: doc.model,
  factoryIaModel: doc.factory_ia_model,
  descricao: doc.descricao ?? '',
  prompt: typeof doc.prompt === 'string' ? doc.prompt : doc.prompt.join('\n'),
  active: doc.active,
  tools_ids: doc.tools_ids ?? [],
  ...(doc.rag_config
    ? {
        rag_config: {
          active: doc.rag_config.active,
          doc_name: doc.rag_config.doc_name ?? '',
          model: doc.rag_config.model ?? '',
          factoryIaModel: doc.rag_config.factory_ia_model ?? '',
          search_strategy: doc.rag_config.search_strategy,
          model_params: doc.rag_config.model_params,
          base_url: doc.rag_config.base_url,
          api_key_ref: doc.rag_config.api_key_ref
        }
      }
    : {}),
  model_params: doc.model_params,
  base_url: doc.base_url,
  api_key_ref: doc.api_key_ref,
  markdown: doc.markdown,
  add_history_to_context: doc.add_history_to_context,
  num_history_runs: doc.num_history_runs,
  add_datetime_to_context: doc.add_datetime_to_context,
  reasoning: doc.reasoning,
  user_memory_active: doc.user_memory_active,
  summary_active: doc.summary_active,
  version: doc.version
})

// Os campos do formulário no documento. O RAG é o documento inteiro (P3-05):
// desligado com algum valor grava `active: false` e os valores (religar volta
// como estava, D-P3-05-3); sem valor nenhum (provedor e estratégia são só
// padrão do formulário) fica `null`. Campo opcional vazio ou ausente fica
// `undefined`: o JSON não o leva e, no PUT, ele apaga o do documento atual.
function ragFields(input: Omit<AgentInput, 'id'>, current?: AgentDocument) {
  const modelParams =
    input.rag_model_params && Object.keys(input.rag_model_params).length > 0
      ? input.rag_model_params
      : undefined
  const hasValues = !!(
    input.rag_doc_name ||
    input.rag_model ||
    input.rag_base_url ||
    input.rag_api_key_ref ||
    modelParams
  )
  if (!input.rag_active && !hasValues) return null
  return {
    ...current?.rag_config,
    active: !!input.rag_active,
    doc_name: input.rag_doc_name ?? '',
    model: input.rag_model ?? '',
    factory_ia_model: input.rag_factoryIaModel || 'openai',
    search_strategy: input.rag_search_strategy || current?.rag_config?.search_strategy,
    model_params: modelParams,
    base_url: input.rag_base_url || undefined,
    api_key_ref: input.rag_api_key_ref || undefined
  }
}

function formFields(input: Omit<AgentInput, 'id'>, current?: AgentDocument) {
  return {
    nome: input.nome,
    model: input.model,
    factory_ia_model: input.factoryIaModel,
    descricao: input.descricao ?? '',
    prompt: input.prompt ?? '',
    active: input.active ?? true,
    tools_ids: input.tools_ids ?? [],
    model_params:
      input.model_params && Object.keys(input.model_params).length > 0
        ? input.model_params
        : undefined,
    base_url: input.base_url || undefined,
    api_key_ref: input.api_key_ref || undefined,
    markdown: input.markdown,
    add_history_to_context: input.add_history_to_context,
    num_history_runs: input.num_history_runs,
    add_datetime_to_context: input.add_datetime_to_context,
    reasoning: input.reasoning,
    user_memory_active: input.user_memory_active,
    summary_active: input.summary_active,
    rag_config: ragFields(input, current)
  }
}

// Campo do documento recusado no 422 ⇒ campo do formulário (Map: o nome vem
// do orquestrador e não pode casar com propriedade de Object). O orquestrador
// recusa `model_params` inteiro, sem dizer qual parâmetro.
const FORM_FIELDS = new Map<string, AgentFormField>([
  ['id', 'id'],
  ['nome', 'nome'],
  ['model', 'model'],
  ['factory_ia_model', 'factoryIaModel'],
  ['descricao', 'descricao'],
  ['prompt', 'prompt'],
  ['active', 'active'],
  ['tools_ids', 'tools_ids'],
  ['model_params', 'model_params'],
  ['base_url', 'base_url'],
  ['api_key_ref', 'api_key_ref'],
  ['markdown', 'markdown'],
  ['add_history_to_context', 'add_history_to_context'],
  ['num_history_runs', 'num_history_runs'],
  ['add_datetime_to_context', 'add_datetime_to_context'],
  ['reasoning', 'reasoning'],
  ['user_memory_active', 'user_memory_active'],
  ['summary_active', 'summary_active'],
  ['rag_config', 'rag_active'],
  ['rag_config.active', 'rag_active'],
  ['rag_config.doc_name', 'rag_doc_name'],
  ['rag_config.model', 'rag_model'],
  ['rag_config.factory_ia_model', 'rag_factoryIaModel'],
  ['rag_config.search_strategy', 'rag_search_strategy'],
  ['rag_config.model_params', 'rag_model_params'],
  ['rag_config.base_url', 'rag_base_url'],
  ['rag_config.api_key_ref', 'rag_api_key_ref']
])

const toFormField = (field: string) => FORM_FIELDS.get(field)

const mapped = (
  result: OrchestratorResult<AgentDocument>
): OrchestratorResult<AgentConfig> => {
  const checked = withFormField(result, toFormField)
  return checked.ok ? { ok: true, data: toAgent(checked.data) } : checked
}

export async function listAgents(
  filters: AgentFilters,
  page: number,
  limit: number
) {
  const result = await listConfigs('agents', agentSchema)
  if (!result.ok) return result
  const agents = result.data.items
    .filter(
      (agent) =>
        (filters.active === undefined || agent.active === filters.active) &&
        (!filters.factoryIaModel || agent.factory_ia_model === filters.factoryIaModel) &&
        matchesSearch(filters.search, [agent.nome, agent.descricao, agent.id])
    )
    .map(toAgent)
  return { ok: true as const, data: pageOf(agents, page, limit) }
}

export async function getAgent(id: string) {
  return mapped(await getConfig('agents', id, agentSchema))
}

export async function createAgent(input: AgentInput) {
  return mapped(
    await createConfig('agents', { id: input.id, ...formFields(input) }, agentSchema)
  )
}

// O PUT troca o documento inteiro: lê o atual e sobrescreve os campos do
// formulário (P3-02: modelo, execução, memória, RAG...); o que ele não conhece
// (chave futura do orquestrador) segue do documento lido. O If-Match é a versão que o browser leu, não a desta leitura:
// se o documento mudou no meio, o orquestrador responde 412.
export async function replaceAgent(
  id: string,
  input: Omit<AgentInput, 'id'>,
  version: number
) {
  const current = await getConfig('agents', id, agentSchema)
  if (!current.ok) return current
  const { version: _read, ...document } = current.data
  void _read
  return mapped(
    await replaceConfig(
      'agents',
      id,
      { ...document, ...formFields(input, current.data), id },
      version,
      agentSchema
    )
  )
}

export const deleteAgent = (id: string, version: number) =>
  deleteConfig('agents', id, version)

export async function deactivateAgent(id: string, version: number) {
  return mapped(await deactivateConfig('agents', id, version, agentSchema))
}
