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
  rag_factoryIaModel: z.string().optional(),
  // P3-02: nome → texto, número ou booleano (D-P3-02-2); vazio ⇒ ausente. Só a
  // referência da chave (`env:`/`file:`), nunca o valor: o orquestrador valida.
  model_params: z.record(requiredText, z.union([z.string(), z.number(), z.boolean()])).optional(),
  base_url: z.string().trim().optional(),
  api_key_ref: z.string().trim().optional(),
  markdown: z.boolean().optional(),
  add_history_to_context: z.boolean().optional(),
  num_history_runs: z.number().int().optional(),
  add_datetime_to_context: z.boolean().optional(),
  reasoning: z.boolean().optional(),
  user_memory_active: z.boolean().optional(),
  summary_active: z.boolean().optional()
}) satisfies z.ZodType<AgentInput>

// No PUT o id vem da rota.
export const agentUpdateSchema = agentBodySchema.omit({ id: true })
