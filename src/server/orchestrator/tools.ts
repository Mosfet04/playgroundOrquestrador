import 'server-only'

import { z } from 'zod'

import type { Tool, ToolFormField } from '@/types/management'

import {
  createConfig,
  deleteConfig,
  getConfig,
  listConfigs,
  matchesSearch,
  pageOf,
  replaceConfig,
  withFormField
} from './adminConfig'
import type { OrchestratorResult } from './client'

// CRUD de tools pela API Admin (P2-06). O documento da tool (Tool do
// orquestrador) tem os mesmos nomes do formulário; os campos legados do form
// (base_url/method/endpoint) não vão. Header em texto volta mascarado (`***`)
// e vai de volta como veio: o orquestrador mantém o valor gravado se a origem
// da `route` não mudou. Todos os campos do documento estão no formulário: o
// PUT não precisa ler o atual.

const toolSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  route: z.string(),
  http_method: z.string(),
  parameters: z.array(
    z.object({
      name: z.string(),
      type: z.string(),
      description: z.string(),
      required: z.boolean(),
      default_value: z.unknown().optional()
    })
  ),
  instructions: z.string().nullish(),
  headers: z.record(z.string(), z.string()).nullish(),
  active: z.boolean(),
  version: z.number().int().nonnegative()
})
type ToolDocument = z.infer<typeof toolSchema>

// Corpo do ToolForm (validado no route handler, src/app/api/tools/schema.ts).
export type ToolInput = {
  id?: string
  name: string
  description: string
  route?: string
  http_method?: string
  method?: string
  base_url?: string
  endpoint?: string
  instructions?: string
  headers?: Record<string, string>
  parameters?: {
    name: string
    type: string
    description: string
    required: boolean
    default_value?: unknown
  }[]
  active?: boolean
}

export type ToolFilters = { search?: string; method?: string }

const toTool = ({ instructions, headers, ...doc }: ToolDocument): Tool => ({
  ...doc,
  instructions: instructions ?? '',
  headers: headers ?? {}
})

// Mesmos defaults do BFF do Mongo: `route` montada dos legados se faltar,
// método GET.
const toDocument = (id: string, input: ToolInput) => ({
  id,
  name: input.name,
  description: input.description,
  route: input.route || `${input.base_url ?? ''}${input.endpoint ?? ''}`,
  http_method: input.http_method || input.method || 'GET',
  instructions: input.instructions ?? '',
  headers: input.headers ?? {},
  parameters: input.parameters ?? [],
  active: input.active ?? true
})

const FORM_FIELDS = new Map<string, ToolFormField>([
  ['id', 'id'],
  ['name', 'name'],
  ['description', 'description'],
  ['route', 'route'],
  ['http_method', 'http_method'],
  ['instructions', 'instructions'],
  ['headers', 'headers'],
  ['active', 'active']
])

// Parâmetro recusado: a linha dele (o orquestrador dá só a posição).
const toFormField = (field: string, indexes?: number[]) =>
  field === 'parameters'
    ? indexes?.length
      ? (`parameters.${indexes[0]}` as const)
      : undefined
    : FORM_FIELDS.get(field)

const mapped = (result: OrchestratorResult<ToolDocument>): OrchestratorResult<Tool> => {
  const checked = withFormField(result, toFormField)
  return checked.ok ? { ok: true, data: toTool(checked.data) } : checked
}

export async function listTools(filters: ToolFilters, page: number, limit: number) {
  const result = await listConfigs('tools', toolSchema)
  if (!result.ok) return result
  const method = filters.method?.toUpperCase()
  const tools = result.data.items
    .filter(
      (tool) =>
        (!method || tool.http_method.toUpperCase() === method) &&
        matchesSearch(filters.search, [tool.name, tool.description, tool.id])
    )
    .map(toTool)
  return { ok: true as const, data: pageOf(tools, page, limit) }
}

export async function getTool(id: string) {
  return mapped(await getConfig('tools', id, toolSchema))
}

export async function createTool(input: ToolInput) {
  const id = input.id || `tool_${Date.now()}`
  return mapped(await createConfig('tools', toDocument(id, input), toolSchema))
}

export async function replaceTool(id: string, input: ToolInput, version: number) {
  return mapped(await replaceConfig('tools', id, toDocument(id, input), version, toolSchema))
}

export const deleteTool = (id: string, version: number) =>
  deleteConfig('tools', id, version)
