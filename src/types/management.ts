// Tipos para gerenciamento de agentes e tools
import type { ObjectId } from 'mongodb'

export interface AgentConfig {
  _id?: ObjectId
  id: string
  nome: string
  model: string
  factoryIaModel: string // valores válidos: os do orquestrador (decisão 0006)
  descricao: string
  prompt: string
  active: boolean
  tools_ids: string[]
  rag_config?: RagConfig
  created_at?: Date
  updated_at?: Date
}

export interface RagConfig {
  active: boolean
  doc_name: string
  model: string
  factoryIaModel: string // valores válidos: os do orquestrador (decisão 0006)
}

export interface Tool {
  _id?: ObjectId
  id: string
  name: string
  description: string
  route: string // URL completa da API (equivale a base_url + endpoint)
  http_method: string // idem (decisão 0006)
  parameters?: Parameter[]
  instructions?: string // Instruções de uso da tool
  headers?: Record<string, string>
  active: boolean
  created_at?: Date
  updated_at?: Date
  
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
