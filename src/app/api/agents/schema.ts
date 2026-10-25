import { z } from 'zod'

import type { AgentInput } from '@/server/orchestrator/agents'

const requiredText = z.string().trim().min(1)

// Campos aceitos de POST/PUT /api/agents (os do AgentForm); o resto é
// descartado. O BFF os traduz para o documento da API Admin (P2-06).
export const agentBodySchema = z.object({
  id: requiredText,
  nome: requiredText,
  model: requiredText,
  // Só o tipo: os valores válidos são os do orquestrador (decisão 0006).
  factoryIaModel: requiredText,
  descricao: z.string().optional(),
  prompt: z.string().optional(),
  active: z.boolean().optional(),
  tools_ids: z.array(z.string()).optional(),
  rag_active: z.boolean().optional(),
  rag_doc_name: z.string().optional(),
  rag_model: z.string().optional(),
  rag_factoryIaModel: z.string().optional()
}) satisfies z.ZodType<AgentInput>

// No PUT o id vem da rota.
export const agentUpdateSchema = agentBodySchema.omit({ id: true })
