import 'server-only'

import { z } from 'zod'

import type { AgentConfig, AgentFormField } from '@/types/management'

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

// CRUD de agents pela API Admin (P2-06), com o formulário de hoje: o BFF
// traduz camelCase/rag_* para o documento snake_case do orquestrador
// (config_documents.py, modo estrito) e de volta. O snapshot OpenAPI não
// descreve o corpo de /admin/config/*: o formato é o do AgentConfig do
// orquestrador (entity_document + `version`).

// Só os campos que o formulário lê; o resto do documento passa adiante sem
// validar (`looseObject`), para o PUT não zerar o que a UI não mostra.
const ragSchema = z.looseObject({
  active: z.boolean(),
  doc_name: z.string().nullish(),
  model: z.string().nullish(),
  factory_ia_model: z.string().nullish()
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
          factoryIaModel: doc.rag_config.factory_ia_model ?? ''
        }
      }
    : {}),
  version: doc.version
})

// Os campos do formulário no documento; o RAG ligado mantém o que o
// formulário não mostra (search_strategy, model_params...), desligado sai
// (`null`, como o Mongo gravava).
function formFields(input: Omit<AgentInput, 'id'>, current?: AgentDocument) {
  return {
    nome: input.nome,
    model: input.model,
    factory_ia_model: input.factoryIaModel,
    descricao: input.descricao ?? '',
    prompt: input.prompt ?? '',
    active: input.active ?? true,
    tools_ids: input.tools_ids ?? [],
    rag_config: input.rag_active
      ? {
          ...current?.rag_config,
          active: true,
          doc_name: input.rag_doc_name ?? '',
          model: input.rag_model ?? '',
          factory_ia_model: input.rag_factoryIaModel || 'openai'
        }
      : null
  }
}

// Campo do documento recusado no 422 ⇒ campo do formulário (Map: o nome vem
// do orquestrador e não pode casar com propriedade de Object).
const FORM_FIELDS = new Map<string, AgentFormField>([
  ['id', 'id'],
  ['nome', 'nome'],
  ['model', 'model'],
  ['factory_ia_model', 'factoryIaModel'],
  ['descricao', 'descricao'],
  ['prompt', 'prompt'],
  ['active', 'active'],
  ['tools_ids', 'tools_ids'],
  ['rag_config', 'rag_active'],
  ['rag_config.active', 'rag_active'],
  ['rag_config.doc_name', 'rag_doc_name'],
  ['rag_config.model', 'rag_model'],
  ['rag_config.factory_ia_model', 'rag_factoryIaModel']
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

// O PUT troca o documento inteiro: lê o atual e sobrescreve só os campos do
// formulário. O If-Match é a versão que o browser leu, não a desta leitura:
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
