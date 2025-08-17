// Tipos para gerenciamento de agentes e tools
import { ObjectId } from 'mongodb'

export interface AgentConfig {
  _id?: ObjectId
  id: string
  nome: string
  model: string
  factoryIaModel: 'ollama' | 'openai' | 'anthropic' | 'gemini' | 'groq' | 'azure'
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
  factoryIaModel: 'ollama' | 'openai' | 'gemini' | 'azure'
}

export interface Tool {
  _id?: ObjectId
  id: string
  name: string
  description: string
  route: string // URL completa da API (equivale a base_url + endpoint)
  http_method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
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
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  endpoint: string
  headers?: Record<string, string>
  parameters?: Parameter[]
}

export interface Parameter {
  name: string
  type: 'string' | 'number' | 'boolean' | 'array' | 'object'
  description: string
  required: boolean
  default_value?: any
}

// Tipos para formulários
export interface CreateAgentForm {
  id: string
  nome: string
  model: string
  factoryIaModel: 'ollama' | 'openai' | 'anthropic' | 'gemini' | 'groq' | 'azure'
  descricao: string
  prompt: string
  active: boolean
  tools_ids: string[]
  rag_active: boolean
  rag_doc_name?: string
  rag_model?: string
  rag_factoryIaModel?: 'ollama' | 'openai' | 'gemini' | 'azure'
}

export interface CreateToolForm {
  id: string
  name: string
  description: string
  route: string // URL completa
  http_method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  instructions?: string
  headers: Record<string, string>
  parameters: Parameter[]
  active: boolean
  
  // Campos para compatibilidade com estrutura antiga
  base_url?: string
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
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
