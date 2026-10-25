import { z } from 'zod'

import type { ToolInput } from '@/server/orchestrator/tools'
import { PARAMETER_TYPES } from '@/types/management'

// O orquestrador recusa tool e parâmetro sem nome ou descrição.
const requiredText = z.string().trim().min(1)

const parameterSchema = z.object({
  name: requiredText,
  type: z.enum(PARAMETER_TYPES),
  description: requiredText,
  required: z.boolean().default(false),
  default_value: z.unknown().optional()
})

// Campos aceitos de POST/PUT /api/tools (os do ToolForm, inclusive os legados
// base_url/method/endpoint, que só montam a `route` se ela faltar); o resto é
// descartado. O BFF os traduz para o documento da API Admin (P2-06).
export const toolBodySchema = z.object({
  id: z.string().optional(),
  name: requiredText,
  description: requiredText,
  route: z.string().optional(),
  // Só o tipo: o orquestrador aceita o método em qualquer caixa (decisão 0006).
  http_method: z.string().optional(),
  method: z.string().optional(),
  base_url: z.string().optional(),
  endpoint: z.string().optional(),
  instructions: z.string().optional(),
  headers: z.record(z.string(), z.string()).optional(),
  parameters: z.array(parameterSchema).optional(),
  active: z.boolean().optional()
}) satisfies z.ZodType<ToolInput>
