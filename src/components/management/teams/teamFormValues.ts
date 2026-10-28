import type { ConfigSchema, CreateTeamForm, TeamConfig } from '@/types/management'
import { toModelParams, toParamRows, type ParamRow } from '../common/modelFormValues'

// Modo de um team novo: o default da entidade (o schema só traz a lista).
export const DEFAULT_MODE = 'route'

// Valores do formulário do team. Os campos de execução ausentes (team novo ou
// sem o campo) ficam `undefined` até o schema chegar, e valem o default dele.
export type TeamFormValues = Omit<CreateTeamForm, 'model_params'> & { params: ParamRow[] }

export const toFormValues = (team?: TeamConfig | null): TeamFormValues => ({
  id: team?.id ?? '',
  nome: team?.nome ?? '',
  descricao: team?.descricao ?? '',
  prompt: team?.prompt ?? '',
  active: team?.active ?? true,
  member_ids: team?.member_ids ?? [],
  mode: team?.mode ?? DEFAULT_MODE,
  factoryIaModel: team?.factoryIaModel || 'ollama',
  model: team?.model ?? '',
  params: toParamRows(team?.model_params),
  base_url: team?.base_url ?? '',
  api_key_ref: team?.api_key_ref ?? '',
  markdown: team?.markdown,
  add_history_to_context: team?.add_history_to_context,
  user_memory_active: team?.user_memory_active ?? true,
  summary_active: team?.summary_active ?? false
})

export function toPayload(values: TeamFormValues): CreateTeamForm {
  const { params, ...rest } = values
  return { ...rest, model_params: toModelParams(params) }
}

// Execução ausente vale o default do schema (o formulário o aplica ao abrir; o
// conflito (P3-06) o aplica à versão atual para comparar o mesmo com o mesmo).
export const executionDefaults = ({ team }: ConfigSchema): Partial<TeamFormValues> => ({
  markdown: team.markdown,
  add_history_to_context: team.addHistoryToContext
})
