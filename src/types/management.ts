// Tipos para gerenciamento de agentes e tools. O BFF traduz a config do
// orquestrador (snake_case, API Admin) para estes formatos (P2-06).

export interface AgentConfig {
  id: string
  nome: string
  model: string
  factoryIaModel: string // valores válidos: os do orquestrador (decisão 0006)
  descricao: string
  prompt: string
  active: boolean
  tools_ids: string[]
  rag_config?: RagConfig
  // Conexão e execução (P3-02): ausente = o orquestrador usa o default. Nomes do
  // documento do orquestrador, como `tools_ids`.
  model_params?: ModelParams
  base_url?: string
  api_key_ref?: string // só a referência (`env:`/`file:`), nunca o valor
  markdown?: boolean
  add_history_to_context?: boolean
  num_history_runs?: number
  add_datetime_to_context?: boolean
  reasoning?: boolean
  user_memory_active?: boolean
  summary_active?: boolean
  // Versão lida: volta no If-Match do PUT/DELETE.
  version: number
  // O orquestrador não guarda datas: a coluna "Atualizado" mostra "—" (D-P2-06-4).
  updated_at?: string
}

// Parâmetros do modelo: nome aceito pelo provider e valor escalar (D-P3-02-2).
export type ModelParams = Record<string, string | number | boolean>

// Team (P3-04): um líder com modelo próprio e os agents que ele aciona. Campos
// do documento do orquestrador, como o agent (`factoryIaModel` do formulário).
export interface TeamConfig {
  id: string
  nome: string
  descricao: string
  prompt: string
  active: boolean
  member_ids: string[]
  mode: string // opções: `team.mode` do /admin/schema; o orquestrador valida
  factoryIaModel: string
  model: string
  model_params?: ModelParams
  base_url?: string
  api_key_ref?: string // só a referência (`env:`/`file:`), nunca o valor
  markdown?: boolean
  add_history_to_context?: boolean
  user_memory_active?: boolean
  summary_active?: boolean
  // Versão lida: volta no If-Match do PUT/DELETE.
  version: number
  updated_at?: string
}

export interface RagConfig {
  active: boolean
  doc_name: string
  model: string
  factoryIaModel: string // valores válidos: os do orquestrador (decisão 0006)
}

export interface Tool {
  id: string
  name: string
  description: string
  route: string // URL completa da API (equivale a base_url + endpoint)
  http_method: string // idem (decisão 0006)
  parameters?: Parameter[]
  instructions?: string // Instruções de uso da tool
  // Valor em texto volta mascarado (`***`); reenviado assim, o orquestrador
  // mantém o gravado. Referência (`env:`/`file:`) volta como está.
  headers?: Record<string, string>
  active: boolean
  version: number
  updated_at?: string
  
  // Mantemos http_config para compatibilidade com código existente
  http_config?: HttpConfig
}

export interface HttpConfig {
  base_url: string
  method: string
  endpoint: string
  headers?: Record<string, string>
  parameters?: Parameter[]
}

export interface Parameter {
  name: string
  type: string // opções: as do /admin/schema (P3-01); o orquestrador valida
  description: string
  required: boolean
  // Só gravado: o orquestrador não o envia na chamada (D-P3-03-1).
  default_value?: unknown
}

// Provider de chat do /admin/schema: o que a config pode pedir dele (P3-02).
export interface ChatProvider {
  name: string
  modelParams: string[] // nomes aceitos em `model_params`; sem tipo (D-P3-02-2)
  requiresBaseUrl: boolean
}

// Opções dos formulários lidas do /admin/schema pelo BFF (P3-01, P3-02).
export interface ConfigSchema {
  chatProviders: ChatProvider[]
  embedderProviders: string[]
  httpMethods: string[]
  parameterTypes: string[]
  // Defaults (e a faixa de `num_history_runs`) dos campos de execução do agent.
  agent: {
    markdown: boolean
    addHistoryToContext: boolean
    addDatetimeToContext: boolean
    reasoning: boolean
    numHistoryRuns: { default: number; minimum: number; maximum: number }
  }
  // Modos e defaults de execução do team (P3-04).
  team: {
    modes: string[]
    markdown: boolean
    addHistoryToContext: boolean
  }
  // Formatos aceitos em `api_key_ref` (ex.: `env:<PROVEDOR>_API_KEY`), de dica.
  apiKeyRefFormats: string[]
  // false: o store de config não aceita escrita (as rotas de escrita recusam).
  writable: boolean
}

// Campos do formulário onde o 422 do orquestrador aparece (P2-06,
// D-P2-06-7): o BFF devolve o campo já com o nome do formulário.
export const AGENT_FORM_FIELDS = [
  'id',
  'nome',
  'model',
  'factoryIaModel',
  'descricao',
  'prompt',
  'active',
  'tools_ids',
  'rag_active',
  'rag_doc_name',
  'rag_model',
  'rag_factoryIaModel',
  'model_params',
  'base_url',
  'api_key_ref',
  'markdown',
  'add_history_to_context',
  'num_history_runs',
  'add_datetime_to_context',
  'reasoning',
  'user_memory_active',
  'summary_active'
] as const
export type AgentFormField = (typeof AGENT_FORM_FIELDS)[number]
export const isAgentFormField = (field: string): field is AgentFormField =>
  (AGENT_FORM_FIELDS as readonly string[]).includes(field)

export const TEAM_FORM_FIELDS = [
  'id',
  'nome',
  'descricao',
  'prompt',
  'active',
  'member_ids',
  'mode',
  'factoryIaModel',
  'model',
  'model_params',
  'base_url',
  'api_key_ref',
  'markdown',
  'add_history_to_context',
  'user_memory_active',
  'summary_active'
] as const
export type TeamFormField = (typeof TEAM_FORM_FIELDS)[number]
export const isTeamFormField = (field: string): field is TeamFormField =>
  (TEAM_FORM_FIELDS as readonly string[]).includes(field)

// Parâmetro recusado: a linha dele (`parameters.<posição>`).
export const TOOL_FORM_FIELDS = [
  'id',
  'name',
  'description',
  'route',
  'http_method',
  'instructions',
  'headers',
  'active'
] as const
export type ToolFormField =
  | (typeof TOOL_FORM_FIELDS)[number]
  | `parameters.${number}`
export const isToolFormField = (field: string): field is ToolFormField =>
  (TOOL_FORM_FIELDS as readonly string[]).includes(field) ||
  /^parameters\.\d{1,4}$/.test(field)

// Tipos para formulários
export interface CreateAgentForm {
  id: string
  nome: string
  model: string
  factoryIaModel: string
  descricao: string
  prompt: string
  active: boolean
  tools_ids: string[]
  rag_active: boolean
  rag_doc_name?: string
  rag_model?: string
  rag_factoryIaModel?: string
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

export type CreateTeamForm = Omit<TeamConfig, 'version' | 'updated_at'>

export interface CreateToolForm {
  id: string
  name: string
  description: string
  route: string // URL completa
  http_method: string
  instructions?: string
  headers: Record<string, string>
  parameters: Parameter[]
  active: boolean
}

// Tipos para responses da API
export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  limit: number
  totalPages: number
}

// Tipos para filtros e busca
export interface AgentFilters {
  active?: boolean
  factoryIaModel?: string
  search?: string
}

export interface ToolFilters {
  method?: string
  search?: string
}

// Tipos para validação
export interface ValidationError {
  field: string
  message: string
}

export interface FormState {
  isLoading: boolean
  errors: ValidationError[]
  isValid: boolean
}
