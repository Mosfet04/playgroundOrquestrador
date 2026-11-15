import { trimFields, withDefaults } from '@/lib/formDiff'
import type { AgentConfig, ConfigSchema, CreateAgentForm } from '@/types/management'
import { toModelParams, toParamRows, type ParamRow } from '../common/modelFormValues'

// Valores do formulário do agent. Os campos de execução ausentes (agent novo
// ou sem o campo) ficam `undefined` até o schema chegar, e valem o default dele.
export type AgentFormValues = Omit<CreateAgentForm, 'model_params' | 'rag_model_params'> & {
  params: ParamRow[]
  rag_params: ParamRow[]
}

export const toFormValues = (agent?: AgentConfig | null): AgentFormValues => ({
  id: agent?.id || '',
  nome: agent?.nome || '',
  model: agent?.model || '',
  factoryIaModel: agent?.factoryIaModel || 'ollama',
  descricao: agent?.descricao || '',
  prompt: agent?.prompt || '',
  active: agent?.active !== undefined ? agent.active : true,
  tools_ids: agent?.tools_ids || [],
  rag_active: agent?.rag_config?.active || false,
  rag_doc_name: agent?.rag_config?.doc_name || '',
  rag_model: agent?.rag_config?.model || '',
  rag_factoryIaModel: agent?.rag_config?.factoryIaModel || 'openai',
  rag_search_strategy: agent?.rag_config?.search_strategy ?? '',
  rag_params: toParamRows(agent?.rag_config?.model_params),
  rag_base_url: agent?.rag_config?.base_url ?? '',
  rag_api_key_ref: agent?.rag_config?.api_key_ref ?? '',
  params: toParamRows(agent?.model_params),
  base_url: agent?.base_url ?? '',
  api_key_ref: agent?.api_key_ref ?? '',
  markdown: agent?.markdown,
  add_history_to_context: agent?.add_history_to_context,
  num_history_runs: agent?.num_history_runs,
  add_datetime_to_context: agent?.add_datetime_to_context,
  reasoning: agent?.reasoning,
  user_memory_active: agent?.user_memory_active ?? false,
  summary_active: agent?.summary_active ?? false
})

// O que `agentBodySchema` apara; o `prompt` e o resto seguem como digitados.
const TRIMMED_BY_BFF = [
  'nome',
  'model',
  'factoryIaModel',
  'base_url',
  'api_key_ref',
  'rag_search_strategy',
  'rag_base_url',
  'rag_api_key_ref'
] as const

export function toPayload(values: AgentFormValues, toolIds: string[]): CreateAgentForm {
  const { params, rag_params, ...rest } = values
  return trimFields(
    {
      ...rest,
      tools_ids: toolIds,
      model_params: toModelParams(params),
      // RAG desligado não valida as linhas (o orquestrador decide): a sem nome não vai.
      rag_model_params: toModelParams(rag_params.filter(({ name }) => name)),
      // Campo numérico vazio dá NaN; com o histórico desligado o vazio é válido.
      num_history_runs: Number.isNaN(values.num_history_runs) ? undefined : values.num_history_runs
    },
    TRIMMED_BY_BFF
  )
}

// Execução ausente vale o default do schema.
const executionDefaults = ({ agent }: ConfigSchema): Partial<AgentFormValues> => ({
  markdown: agent.markdown,
  add_datetime_to_context: agent.addDatetimeToContext,
  add_history_to_context: agent.addHistoryToContext,
  reasoning: agent.reasoning,
  num_history_runs: agent.numHistoryRuns.default
})

// Provedor do embedder que o orquestrador não oferece vira o 1º das opções.
export const offeredEmbedder = (provider: string | undefined, { embedderProviders }: ConfigSchema) =>
  provider && embedderProviders.some(({ name }) => name === provider)
    ? provider
    : (embedderProviders[0]?.name ?? '')

// Uma versão da config como o formulário a mostraria aberta sem tocar (os efeitos
// do AgentForm): para comparar o mesmo com o mesmo (P4-02 §7) e para refazer o
// formulário depois do 200 (D-P4-02-6), quando os efeitos não rodam de novo.
export function readValues(agent: AgentConfig, schema?: ConfigSchema): AgentFormValues {
  const values = toFormValues(agent)
  if (!schema) return values
  return {
    ...withDefaults(values, executionDefaults(schema)),
    rag_factoryIaModel:
      agent.rag_config?.factoryIaModel || offeredEmbedder(values.rag_factoryIaModel, schema),
    rag_search_strategy: values.rag_search_strategy || (schema.ragSearchStrategies[0] ?? '')
  }
}
