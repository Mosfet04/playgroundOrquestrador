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

export function toPayload(values: AgentFormValues, toolIds: string[]): CreateAgentForm {
  const { params, rag_params, ...rest } = values
  return {
    ...rest,
    tools_ids: toolIds,
    model_params: toModelParams(params),
    // RAG desligado não valida as linhas (o orquestrador decide): a sem nome não vai.
    rag_model_params: toModelParams(rag_params.filter(({ name }) => name)),
    // Campo numérico vazio dá NaN; com o histórico desligado o vazio é válido.
    num_history_runs: Number.isNaN(values.num_history_runs) ? undefined : values.num_history_runs
  }
}

// Execução ausente vale o default do schema (o formulário o aplica ao abrir; o
// conflito (P3-06) o aplica à versão atual para comparar o mesmo com o mesmo).
export const executionDefaults = ({ agent }: ConfigSchema): Partial<AgentFormValues> => ({
  markdown: agent.markdown,
  add_datetime_to_context: agent.addDatetimeToContext,
  add_history_to_context: agent.addHistoryToContext,
  reasoning: agent.reasoning,
  num_history_runs: agent.numHistoryRuns.default
})
