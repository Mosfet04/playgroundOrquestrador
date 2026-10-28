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
