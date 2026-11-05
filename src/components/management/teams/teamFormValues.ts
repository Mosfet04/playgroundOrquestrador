import { trimFields, withDefaults } from '@/lib/formDiff'
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

// O que `teamBodySchema` apara; o `prompt` e o resto seguem como digitados.
const TRIMMED_BY_BFF = ['nome', 'model', 'factoryIaModel', 'mode', 'base_url', 'api_key_ref'] as const

export function toPayload(values: TeamFormValues): CreateTeamForm {
  const { params, ...rest } = values
  return trimFields(
    {
      ...rest,
      member_ids: rest.member_ids.map((id) => id.trim()),
      model_params: toModelParams(params)
    },
    TRIMMED_BY_BFF
  )
}

// Execução ausente vale o default do schema.
const executionDefaults = ({ team }: ConfigSchema): Partial<TeamFormValues> => ({
  markdown: team.markdown,
  add_history_to_context: team.addHistoryToContext
})

// Uma versão da config como o formulário a mostraria aberta sem tocar: para
// comparar o mesmo com o mesmo e para refazer o formulário depois do 200
// (D-P4-02-6), quando os efeitos não rodam de novo.
export const readValues = (team: TeamConfig, schema?: ConfigSchema): TeamFormValues =>
  withDefaults(toFormValues(team), schema ? executionDefaults(schema) : {})
