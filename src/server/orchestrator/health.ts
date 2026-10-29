import 'server-only'

import { z } from 'zod'

import { callOrchestrator } from './client'
import type { components } from './openapi'

// GET /health do AgentOS (chave run): o orquestrador responde e aceita a chave.
const healthSchema = z.object({ status: z.string() }) satisfies z.ZodType<
  Pick<components['schemas']['HealthResponse'], 'status'>
>

export const getOrchestratorHealth = () =>
  callOrchestrator('/health', { key: 'run', schema: healthSchema })

// GET /admin/health (chave admin, FA-04): só a revisão do runtime em vigor; os
// checks ficam aqui. O snapshot não tipa o corpo, por isso o zod é o contrato.
const runtimeSchema = z.object({ runtime_revision: z.number().int().nonnegative() })

export const getRuntimeRevision = () =>
  callOrchestrator('/admin/health', { key: 'admin', schema: runtimeSchema })
