import { z } from 'zod'

// Saúde do orquestrador no formato do BFF (P4-05, D-P4-05-8), em
// GET /api/orchestrator/runtime: o servidor a monta a partir do /admin/health e
// a casca a valida ao ler. Só status e números; nenhum texto do orquestrador.
// `healthy`: o orquestrador respondeu 200; `degraded`: 503 com o corpo dos
// checks. Check que falhou, estourou ou não veio é `error`.
export const runtimeHealthSchema = z.object({
  status: z.enum(['healthy', 'degraded']),
  revision: z.number().int().nonnegative(),
  responseTimeMs: z.number().nonnegative().optional(),
  checks: z.object({
    database: z.enum(['healthy', 'error']),
    memory: z.object({
      status: z.enum(['healthy', 'warning', 'unavailable', 'error']),
      usagePercent: z.number().min(0).max(100).optional(),
      availableGb: z.number().nonnegative().optional()
    }),
    telemetry: z.enum(['configured', 'not_configured', 'error'])
  })
})

export type RuntimeHealth = z.infer<typeof runtimeHealthSchema>
