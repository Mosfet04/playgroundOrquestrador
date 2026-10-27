import { paramValue } from '@/lib/modelParams'
import type { ModelParams } from '@/types/management'

// Parte do formulário que agent e team compartilham (seção Modelo, P3-02 e
// P3-04): os parâmetros do modelo são linhas nome + valor em texto
// (D-P3-02-2); `toModelParams` os transforma no objeto do corpo.
export type ParamRow = { name: string; value: string }
export type ModelFormValues = {
  factoryIaModel: string
  model: string
  base_url?: string
  api_key_ref?: string
  params: ParamRow[]
}

export const toParamRows = (params?: ModelParams): ParamRow[] =>
  Object.entries(params ?? {}).map(([name, value]) => ({ name, value: String(value) }))

export const toModelParams = (rows: ParamRow[]): ModelParams =>
  Object.fromEntries(rows.map(({ name, value }) => [name, paramValue(value)]))
