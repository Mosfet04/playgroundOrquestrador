import 'server-only'

import { z } from 'zod'

import type { RuntimeHealth } from '@/lib/runtimeHealth'

import { callOrchestrator, type OrchestratorResult } from './client'
import type { components } from './openapi'

// GET /health do AgentOS (chave run): o orquestrador responde e aceita a chave.
const healthSchema = z.object({ status: z.string() }) satisfies z.ZodType<
  Pick<components['schemas']['HealthResponse'], 'status'>
>

export const getOrchestratorHealth = () =>
  callOrchestrator('/health', { key: 'run', schema: healthSchema })

// GET /admin/health (chave admin, FA-04): checks do HealthService e a revisão
// do runtime. O snapshot não tipa o corpo, por isso o zod é o contrato. 200 se
// tudo saudável; 503 com o mesmo corpo se algum check falhou (degradado). Um
// check que estourou vem `{status: "error"}`; o Mongo fora, `unhealthy`; os
// dois, ausente ou status desconhecido viram `error`. Só status e números
// saem daqui: `message` (memória) e `provider` (OTLP) são texto livre (D-P4-05-8).
const orUndefined = <T extends z.ZodType>(schema: T) => schema.optional().catch(undefined)

const adminHealthSchema = z.object({
  runtime_revision: z.number().int().nonnegative(),
  response_time_ms: orUndefined(z.number().nonnegative()),
  checks: z.object({
    mongodb: orUndefined(z.object({ status: z.literal('healthy') })),
    memory: orUndefined(
      z.object({
        status: z.enum(['healthy', 'warning', 'unavailable']),
        usage_percent: orUndefined(z.number().min(0).max(100)),
        available_gb: orUndefined(z.number().nonnegative())
      })
    ),
    otlp: orUndefined(z.object({ status: z.enum(['configured', 'not_configured']) }))
  })
})

const DEGRADED = 503

const toRuntimeHealth = (
  { runtime_revision, response_time_ms, checks }: z.infer<typeof adminHealthSchema>,
  status: number | undefined
): RuntimeHealth => ({
  status: status === DEGRADED ? 'degraded' : 'healthy',
  revision: runtime_revision,
  responseTimeMs: response_time_ms,
  checks: {
    database: checks.mongodb?.status ?? 'error',
    memory: checks.memory
      ? {
          status: checks.memory.status,
          usagePercent: checks.memory.usage_percent,
          availableGb: checks.memory.available_gb
        }
      : { status: 'error' },
    telemetry: checks.otlp?.status ?? 'error'
  }
})

export async function getRuntimeHealth(): Promise<OrchestratorResult<RuntimeHealth>> {
  const result = await callOrchestrator('/admin/health', {
    key: 'admin',
    schema: adminHealthSchema,
    acceptStatus: [DEGRADED]
  })
  return result.ok ? { ok: true, data: toRuntimeHealth(result.data, result.status) } : result
}
