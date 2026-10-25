import { paramValue } from '@/lib/modelParams'
import type { AgentConfig, CreateAgentForm } from '@/types/management'

// Valores do formulário do agent. Os parâmetros do modelo são linhas nome +
// valor em texto (D-P3-02-2); `toPayload` os transforma no objeto do corpo.
// Os campos de execução ausentes (agent novo ou sem o campo) ficam
// `undefined` até o schema chegar, e valem o default dele.
export type ParamRow = { name: string; value: string }
export type AgentFormValues = Omit<CreateAgentForm, 'model_params'> & { params: ParamRow[] }

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
  params: Object.entries(agent?.model_params ?? {}).map(([name, value]) => ({
    name,
    value: String(value)
  })),
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
  const { params, ...rest } = values
  return {
    ...rest,
    tools_ids: toolIds,
    model_params: Object.fromEntries(params.map(({ name, value }) => [name, paramValue(value)])),
    // Campo numérico vazio dá NaN; com o histórico desligado o vazio é válido.
    num_history_runs: Number.isNaN(values.num_history_runs) ? undefined : values.num_history_runs
  }
}
