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
  // Versão lida: volta no If-Match do PUT/DELETE.
  version: number
  // O orquestrador não guarda datas: a coluna "Atualizado" mostra "—" (D-P2-06-4).
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

// Tipos que o orquestrador aceita (ParameterType em src/domain/entities/tool.py);
// `number` não existe lá e derruba o carregamento da tool.
export const PARAMETER_TYPES = [
  'string',
  'integer',
  'float',
  'boolean',
  'object',
  'array'
] as const

export interface Parameter {
  name: string
  type: (typeof PARAMETER_TYPES)[number]
  description: string
  required: boolean
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  default_value?: any
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
  'rag_factoryIaModel'
] as const
export type AgentFormField = (typeof AGENT_FORM_FIELDS)[number]
export const isAgentFormField = (field: string): field is AgentFormField =>
  (AGENT_FORM_FIELDS as readonly string[]).includes(field)

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
}

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
  
  // Campos para compatibilidade com estrutura antiga
  base_url?: string
  method?: string
  endpoint?: string
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
